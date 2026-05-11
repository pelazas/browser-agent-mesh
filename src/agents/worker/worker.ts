import * as Y from 'yjs';
import { BaseAgent } from '../base';
import { getActiveWorkflows } from '@core/blackboard/root-doc';
import { acquireLock, releaseLock } from '@core/blackboard/lock';
import {
  completeTask as completeWorkflowTask,
  failTask as failWorkflowTask,
  markTaskRunning as markWorkflowTaskRunning,
  updateWorkflowPreviewResult,
} from '@core/blackboard/task-state';
import type { Edge, GPUProfile, TaskNode } from '@core/blackboard/schema';
import { chatStream, getCurrentModel, getEngineStatus, loadModel, selectBestModel } from '@webllm/index';
import { DAG } from '@core/graph/dag';

const STREAM_FLUSH_INTERVAL_MS = 150;
const STREAM_FLUSH_MIN_CHARS = 24;
const DEFAULT_REDUCE_CONFIDENCE = 0.8;

interface NodeConfig {
  gpuProfile: GPUProfile | null;
  tabId?: string;
}

export class NodeWorkerAgent extends BaseAgent {
  private gpuProfile: GPUProfile | null;
  private modelId: string | null = null;

  constructor(config: NodeConfig) {
    super({ role: 'worker', tabId: config.tabId, gpu: config.gpuProfile });
    this.gpuProfile = config.gpuProfile;
  }

  protected async run(): Promise<void> {
    this.log.info('node worker running');
    await this.ensureModelReady();

    const pollInterval = 1500;

    while (this.running) {
      try {
        await this.pollAndExecute();
      } catch (err) {
        this.log.error('poll error', { error: String(err) });
      }
      await this.sleep(pollInterval);
    }
  }

  private async pollAndExecute(): Promise<void> {
    const workflows = getActiveWorkflows(this.doc);
    if (!workflows) return;

    const hasWorkflows = workflows.size > 0;
    if (hasWorkflows) {
      this.log.info('poll cycle', { workflowCount: workflows.size });
    }

    for (const [workflowId] of workflows) {
      const workflow = workflows.get(workflowId);
      if (!workflow) continue;

      const state = workflow.get('state');
      if (state !== 'active') continue;

      const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
      if (!dagMap) continue;

      const edges = workflow.get('edges') as Y.Array<unknown>;
      const nodesArray: TaskNode[] = [];

      for (const [nodeId, nodeEntry] of dagMap) {
        nodesArray.push({
          id: nodeId,
          ...(nodeEntry.toJSON() as unknown as Omit<TaskNode, 'id'>),
        });
      }

      if (nodesArray.length === 0) continue;

      const dag = DAG.fromJSON({
        nodes: nodesArray,
        edges: edges.toJSON() as unknown as Edge[],
      });

      const readyTasks = dag.getReadyTasks();

      for (const task of readyTasks) {
        if (task.type === 'retrieve' || task.type === 'scrape' || task.type === 'condition') {
          continue; // Not for Node Workers
        }

        const lock = acquireLock(this.doc, workflowId, task.id, this.nodeId);
        if (!lock.acquired) continue;

        this.log.info('task claimed', { taskId: task.id, workflowId });

        try {
          this.markTaskRunning(workflowId, task.id);
          const result = await this.executeTask(task, workflowId);
          this.completeTask(workflowId, task.id, result);
        } catch (err) {
          this.failTask(workflowId, task.id, String(err));
        } finally {
          releaseLock(this.doc, workflowId, task.id, this.nodeId);
        }
      }
    }
  }

  private async executeTask(task: TaskNode, workflowId?: string): Promise<unknown> {
    this.log.info('executing task', { taskId: task.id, type: task.type });

    if (task.type === 'llm_inference') {
      await this.ensureModelReady();
      const status = getEngineStatus();
      if (status !== 'ready') {
        throw new Error(`Engine not ready: ${status}`);
      }

      const prompt = typeof task.args.prompt === 'string' ? task.args.prompt : task.description;
      const modelId = getCurrentModel() ?? this.modelId;

      if (workflowId) {
        this.updateWorkflowPreview(workflowId, {
          type: 'llm_result_partial',
          prompt,
          output: '',
          modelId,
          tokensGenerated: 0,
          tokensPerSec: 0,
        });
      }

      let lastFlushedText = '';
      let lastFlushAt = 0;

      const flushPreview = (text: string, tokensGenerated: number, tokensPerSec: number, force: boolean): void => {
        if (!workflowId) return;

        const now = Date.now();
        const charDelta = text.length - lastFlushedText.length;
        if (!force && charDelta < STREAM_FLUSH_MIN_CHARS && now - lastFlushAt < STREAM_FLUSH_INTERVAL_MS) {
          return;
        }

        lastFlushedText = text;
        lastFlushAt = now;
        this.updateWorkflowPreview(workflowId, {
          type: 'llm_result_partial',
          prompt,
          output: text,
          modelId,
          tokensGenerated,
          tokensPerSec,
        });
      };

      const response = await chatStream(
        [{ role: 'user', content: prompt }],
        undefined,
        (progress) => {
          flushPreview(progress.text, progress.tokensGenerated, progress.tokensPerSec, false);
        },
      );

      flushPreview(response.message.content, response.tokensGenerated, response.tokensPerSec, true);

      return {
        type: 'llm_result',
        prompt,
        output: response.message.content,
        modelId,
        tokensGenerated: response.tokensGenerated,
        tokensPerSec: response.tokensPerSec,
      };
    }

    if (task.type === 'reduce') {
      if (!workflowId) {
        throw new Error('Reduce task requires workflowId');
      }

      const predecessorResults = this.getCompletedPredecessorResults(workflowId, task.id);

      let scrapeContent: string | null = null;
      for (const result of predecessorResults) {
        if (
          typeof result === 'object' &&
          result !== null &&
          (result as Record<string, unknown>).type === 'scrape_result'
        ) {
          const content = (result as Record<string, unknown>).content;
          if (typeof content === 'string' && content.trim().length > 0) {
            scrapeContent = content;
            break;
          }
        }
      }

      if (!scrapeContent) {
        return { type: 'reduce_result', output: `Reduced: ${task.description}` };
      }

      const cleanedText = this.cleanExtractedDocumentText(scrapeContent);
      if (!cleanedText.trim()) {
        throw new Error('Scrape content was empty after cleanup');
      }

      const llmSummary = await this.summarizeWithLlm(cleanedText);
      if (llmSummary) {
        return {
          type: 'reduce_result',
          sourceType: 'scrape_result',
          title: llmSummary.title,
          description: llmSummary.description,
          sectionSummaries: llmSummary.sectionSummaries,
          takeaways: llmSummary.takeaways,
          confidence: DEFAULT_REDUCE_CONFIDENCE,
        };
      }

      const title = this.deriveDocumentTitle(cleanedText);
      const sectionSummaries = this.deriveSectionHeadings(cleanedText).map((name) => ({ name, summary: '' }));
      const description = this.buildOverview(cleanedText);
      const takeaways = this.deriveTakeaways(sectionSummaries);

      return {
        type: 'reduce_result',
        sourceType: 'scrape_result',
        title,
        description,
        sectionSummaries,
        takeaways,
        confidence: DEFAULT_REDUCE_CONFIDENCE,
      };
    }

    throw new Error(`Unsupported task type for worker: ${task.type}`);
  }

  private async ensureModelReady(): Promise<void> {
    if (!this.gpuProfile) {
      throw new Error('No GPU profile available for Node Worker');
    }

    const model = selectBestModel(this.gpuProfile.vramEstimateMB, 'medium');
    if (!model) {
      throw new Error('No compatible WebLLM model found for this worker');
    }

    this.modelId = model.id;
    this.syncNodeMetadata({ selectedModelId: model.id, gpu: this.gpuProfile });

    if (getEngineStatus() === 'ready' && getCurrentModel() === model.id) {
      return;
    }

    this.log.info('loading selected model', { model: model.id });
    await loadModel(model.id);
    this.log.info('model ready', { model: model.id });
  }

  private markTaskRunning(workflowId: string, taskId: string): void {
    markWorkflowTaskRunning(this.doc, workflowId, taskId, this.nodeId);
  }

  private completeTask(workflowId: string, taskId: string, result: unknown): void {
    completeWorkflowTask(this.doc, workflowId, taskId, result);

    this.log.info('task completed', { taskId, workflowId });
  }

  private failTask(workflowId: string, taskId: string, error: string): void {
    failWorkflowTask(this.doc, workflowId, taskId, error);

    this.log.warn('task failed', { taskId, workflowId, error });
  }

  private updateWorkflowPreview(workflowId: string, result: unknown): void {
    updateWorkflowPreviewResult(this.doc, workflowId, result);
  }

  private getCompletedPredecessorResults(workflowId: string, taskId: string): unknown[] {
    const workflows = getActiveWorkflows(this.doc);
    const workflow = workflows.get(workflowId);
    if (!workflow) return [];

    const edges = workflow.get('edges') as Y.Array<unknown>;
    const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;

    const predecessorIds: string[] = [];
    for (const edge of edges.toJSON() as Array<{ source: string; target: string }>) {
      if (edge.target === taskId) {
        predecessorIds.push(edge.source);
      }
    }

    const results: unknown[] = [];
    for (const predId of predecessorIds) {
      const predNode = dagMap.get(predId);
      if (predNode && predNode.get('status') === 'completed' && predNode.get('result') !== null) {
        results.push(predNode.get('result'));
      }
    }

    return results;
  }

  private cleanExtractedDocumentText(raw: string): string {
    const lines = raw.split('\n');
    const cleaned: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('Title:') ||
        trimmed.startsWith('URL Source:') ||
        trimmed.startsWith('Published Time:') ||
        trimmed.startsWith('Markdown Content:') ||
        /^>\s*[ivxlcdm0-9]+/iu.test(trimmed)
      ) {
        continue;
      }
      cleaned.push(line);
    }
    return cleaned.join('\n').trim();
  }

  private deriveDocumentTitle(text: string): string | null {
    const match = text.match(/^#\s+(.+)$/m);
    if (match) return match[1].trim();

    const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
    return firstLine ?? null;
  }

  private deriveSectionHeadings(text: string): string[] {
    const headings: string[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,2})\s+(.+)$/);
      if (headingMatch) {
        headings.push(headingMatch[2].trim());
      }
    }

    return headings;
  }

  private buildOverview(text: string): string {
    const lines = text.split('\n').map((l) => l.trim());
    const nonHeadingLines = lines.filter((l) => l.length > 0 && !l.startsWith('#'));
    return nonHeadingLines.slice(0, 3).join(' ').trim();
  }

  private deriveTakeaways(sectionSummaries: Array<{ name: string }>): string[] {
    const takeaways = sectionSummaries
      .filter((item) => item.name.length > 0)
      .map((item) => `Covers ${item.name}.`);
    return takeaways.slice(0, 5);
  }

  private async summarizeWithLlm(text: string): Promise<{
    title: string | null;
    description: string;
    sectionSummaries: Array<{ name: string; summary: string }>;
    takeaways: string[];
  } | null> {
    try {
      await this.ensureModelReady();
      const status = getEngineStatus();
      if (status !== 'ready') {
        this.log.warn('LLM not ready for summarization, falling back to heuristics', { status });
        return null;
      }

      const MAX_CHARS = 30_000;
      const truncated = text.length > MAX_CHARS
        ? `${text.slice(0, MAX_CHARS)}\n\n[Document truncated]`
        : text;

      const prompt = [
        'You are a document summarizer. Read the text below and return ONLY a JSON object',
        'with this exact shape (no markdown code blocks, no extra text):',
        '',
        '{"title":"...","description":"1-2 paragraphs explaining what this document says","sectionSummaries":[{"name":"Section title","summary":"1-2 sentences explaining what this section covers and why it matters"},...],"takeaways":["Notable insight as a full sentence",...]}',
        '',
        'The description should clearly explain what the document is about and what it covers.',
        'Each section summary must explain the section content, not just repeat the title.',
        'Limit sectionSummaries to 6 items and takeaways to 5 items.',
        '',
        'Document text:',
        '---',
        truncated,
      ].join('\n');

      const response = await chatStream(
        [{ role: 'user', content: prompt }],
        undefined,
        () => { /* no progress callback needed for reduce */ },
      );

      const raw = response.message.content.trim();
      const parsed = this.tryParseSummaryJson(raw);

      if (parsed) {
        this.log.info('LLM summarization succeeded', {
          title: parsed.title,
          sectionCount: parsed.sectionSummaries.length,
          takeawayCount: parsed.takeaways.length,
        });
        return parsed;
      }

      this.log.warn('LLM summarization returned unparseable JSON, falling back to heuristics', { raw: raw.slice(0, 200) });
      return null;
    } catch (err) {
      this.log.warn('LLM summarization failed, falling back to heuristics', { error: String(err) });
      return null;
    }
  }

  private tryParseSummaryJson(raw: string): {
    title: string | null;
    description: string;
    sectionSummaries: Array<{ name: string; summary: string }>;
    takeaways: string[];
  } | null {
    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      const title = typeof parsed.title === 'string' ? parsed.title : null;
      const description = typeof parsed.description === 'string' ? parsed.description : '';

      const sectionSummaries = Array.isArray(parsed.sectionSummaries)
        ? parsed.sectionSummaries
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .map((item) => ({
              name: typeof item.name === 'string' ? item.name : '',
              summary: typeof item.summary === 'string' ? item.summary : '',
            }))
            .filter((item) => item.name.length > 0 && item.summary.length > 0)
        : [];

      const takeaways = Array.isArray(parsed.takeaways)
        ? parsed.takeaways.filter((s): s is string => typeof s === 'string')
        : [];

      return { title, description, sectionSummaries, takeaways };
    } catch {
      return null;
    }
  }
}
