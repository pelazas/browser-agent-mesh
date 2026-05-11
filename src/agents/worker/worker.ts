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
import { preparePdfDocument } from './pdf-summary';

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
      let scrapeContentType: string | null = null;
      let scrapeFormat: string | null = null;
      for (const result of predecessorResults) {
        if (
          typeof result === 'object' &&
          result !== null &&
          (result as Record<string, unknown>).type === 'scrape_result'
        ) {
          const typedResult = result as Record<string, unknown>;
          const content = typedResult.content;
          if (typeof content === 'string' && content.trim().length > 0) {
            scrapeContent = content;
            scrapeContentType = typeof typedResult.contentType === 'string' ? typedResult.contentType : null;
            scrapeFormat = typeof typedResult.format === 'string' ? typedResult.format : null;
            break;
          }
        }
      }

      if (!scrapeContent) {
        throw new Error(`No usable scrape content was available for: ${task.description}`);
      }

      const normalizedScrapeContent = scrapeFormat === 'html'
        ? this.extractTextFromHtml(scrapeContent)
        : scrapeContent;

      if (!normalizedScrapeContent.trim()) {
        throw new Error('Scrape content was empty after cleanup');
      }

      const documentLikeText = this.isDocumentLikeScrape(scrapeContentType, scrapeFormat);
      const llmSummary = documentLikeText
        ? await this.summarizePreparedDocumentWithLlm(preparePdfDocument(normalizedScrapeContent))
        : await this.summarizeWithLlm(normalizedScrapeContent);
      if (llmSummary) {
        return {
          type: 'reduce_result',
          sourceType: 'scrape_result',
          title: llmSummary.title,
          summary: llmSummary.summary,
          highlights: llmSummary.highlights,
          confidence: DEFAULT_REDUCE_CONFIDENCE,
        };
      }

      const preparedDocument = documentLikeText
        ? preparePdfDocument(normalizedScrapeContent)
        : {
            title: this.deriveDocumentTitle(normalizedScrapeContent),
            cleanedText: normalizedScrapeContent.trim(),
            bodyText: '',
            chunks: [],
          };
      if (!preparedDocument.cleanedText.trim()) {
        throw new Error('Scrape content was empty after cleanup');
      }

      const fallbackText = documentLikeText
        ? preparedDocument.bodyText
        : preparedDocument.cleanedText;
      const title = preparedDocument.title ?? this.deriveDocumentTitle(fallbackText);
      const summary = this.buildNarrativeSummary(fallbackText, title);
      const highlights = this.buildHighlights(fallbackText, title);

      return {
        type: 'reduce_result',
        sourceType: 'scrape_result',
        title,
        summary,
        highlights,
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

  private deriveDocumentTitle(text: string): string | null {
    const match = text.match(/^#\s+(.+)$/m);
    if (match) return match[1].trim();

    const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
    return firstLine ?? null;
  }

  private isDocumentLikeScrape(contentType: string | null, format: string | null): boolean {
    if (contentType === 'application/pdf') {
      return true;
    }

    if (format !== 'text') {
      return false;
    }

    if (!contentType) {
      return true;
    }

    return !contentType.includes('html');
  }

  private buildNarrativeSummary(text: string, title: string | null): string {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/^#+\s+/gm, '').replace(/\s+/g, ' ').trim())
      .filter((paragraph) => paragraph.length > 0);

    const body = title
      ? paragraphs.filter((paragraph) => paragraph !== title)
      : paragraphs;

    const summary = body.slice(0, 3).join('\n\n').trim();
    return summary || title || text.replace(/^#+\s+/gm, '').replace(/\s+/g, ' ').trim();
  }

  private buildHighlights(text: string, title: string | null): string[] {
    const sentences = text
      .replace(/^#+\s+/gm, '')
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
      .filter((sentence) => sentence.length > 40);

    const filtered = title
      ? sentences.filter((sentence) => sentence !== title && !sentence.startsWith(title))
      : sentences;

    return filtered.slice(0, 3);
  }

  private extractTextFromHtml(html: string): string {
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/p\s*>/gi, '\n\n')
      .replace(/<\s*\/div\s*>/gi, '\n\n')
      .replace(/<\s*\/h[1-6]\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private async summarizePreparedDocumentWithLlm(preparedDocument: {
    title: string | null;
    cleanedText: string;
    bodyText: string;
    chunks: string[];
  }): Promise<{
    title: string | null;
    summary: string;
    highlights: string[];
  } | null> {
    try {
      await this.ensureModelReady();
      const status = getEngineStatus();
      if (status !== 'ready') {
        this.log.warn('LLM not ready for summarization, falling back to heuristics', { status });
        return null;
      }

      const sourceText = preparedDocument.bodyText || preparedDocument.cleanedText;
      const chunks = preparedDocument.chunks.length > 0 ? preparedDocument.chunks : [sourceText];
      const chunkSummaries: string[] = [];

      for (const [index, chunk] of chunks.entries()) {
        const chunkPrompt = [
          'You are summarizing one prepared document chunk.',
          `Document chunk ${index + 1} of ${chunks.length}.`,
          preparedDocument.title ? `Document title: ${preparedDocument.title}` : null,
          'Return a short narrative summary focused on purpose, key ideas, and practical relevance.',
          'Do not include front matter, section inventories, or JSON.',
          '',
          'Chunk text:',
          '---',
          chunk,
        ].filter((line): line is string => Boolean(line)).join('\n');

        const chunkResponse = await chatStream(
          [{ role: 'user', content: chunkPrompt }],
          undefined,
          () => { /* no progress callback needed for reduce */ },
        );

        const chunkSummary = chunkResponse.message.content.trim();
        if (!chunkSummary) {
          return null;
        }

        chunkSummaries.push(chunkSummary);
      }

      const prompt = [
        'You are a document summarizer. Synthesize the chunk summaries below and return ONLY a JSON object',
        'with this exact shape (no markdown code blocks, no extra text):',
        '',
        '{"title":"...","summary":"2-4 paragraphs that explain what the document is about, the main ideas it covers, and why it matters","highlights":["Concrete point or practical takeaway as a full sentence",...]}',
        '',
        'Write a human-readable executive summary, not a table of contents.',
        'Do not list section names unless they are necessary to explain the document.',
        'Explain the document purpose, the main themes, and the practical relevance.',
        'Limit highlights to 3 items.',
        preparedDocument.title ? `Prefer this title when accurate: ${preparedDocument.title}` : null,
        '',
        'Chunk summaries:',
        '---',
        chunkSummaries.map((summary, index) => `Chunk ${index + 1}: ${summary}`).join('\n\n'),
      ].filter((line): line is string => Boolean(line)).join('\n');

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
          summaryLength: parsed.summary.length,
          highlightCount: parsed.highlights.length,
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

  private async summarizeWithLlm(text: string): Promise<{
    title: string | null;
    summary: string;
    highlights: string[];
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
        '{"title":"...","summary":"2-4 paragraphs that explain what the document is about, the main ideas it covers, and why it matters","highlights":["Concrete point or practical takeaway as a full sentence",...]}',
        '',
        'Write a human-readable executive summary, not a table of contents.',
        'Do not list section names unless they are necessary to explain the document.',
        'Explain the document purpose, the main themes, and the practical relevance.',
        'Limit highlights to 3 items.',
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
          summaryLength: parsed.summary.length,
          highlightCount: parsed.highlights.length,
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
    summary: string;
    highlights: string[];
  } | null {
    try {
      const cleaned = this.extractJsonObject(raw);
      if (!cleaned) {
        return null;
      }

      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      const title = typeof parsed.title === 'string' ? parsed.title : null;
      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
      const highlights = Array.isArray(parsed.highlights)
        ? parsed.highlights.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [];

      if (!summary) {
        return null;
      }

      return { title, summary, highlights };
    } catch {
      return null;
    }
  }

  private extractJsonObject(raw: string): string | null {
    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const start = raw.indexOf('{');
    if (start < 0) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return raw.slice(start, index + 1).trim();
        }
      }
    }

    return null;
  }
}
