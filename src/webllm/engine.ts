import { createLogger } from '@utils/logging';

const log = createLogger('webllm-engine');

export type EngineStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatConfig {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  repetitionPenalty?: number;
}

export interface ChatResult {
  message: ChatMessage;
  tokensGenerated: number;
  tokensPerSec: number;
}

export interface ChatStreamProgress {
  text: string;
  chunkText: string;
  tokensGenerated: number;
  tokensPerSec: number;
}

let engine: unknown = null;
let status: EngineStatus = 'unloaded';
let currentModel: string | null = null;

export function getEngineStatus(): EngineStatus {
  return status;
}

export function getCurrentModel(): string | null {
  return currentModel;
}

export async function loadModel(
  modelId: string,
  _opts?: { temperature?: number; topP?: number },
): Promise<void> {
  status = 'loading';
  log.info('loading model', { modelId });

  try {
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

    engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (report: { progress: number; text: string }) => {
        log.debug('model load progress', { progress: report.progress, text: report.text });
      },
    });

    currentModel = modelId;
    status = 'ready';
    log.info('model loaded', { modelId });
  } catch (err) {
    status = 'error';
    log.error('failed to load model', { modelId, error: String(err) });
    throw err;
  }
}

export async function chat(
  messages: ChatMessage[],
  config?: ChatConfig,
): Promise<ChatResult> {
  if (!engine) throw new Error('Engine not loaded');

  status = 'ready';

  const startTime = performance.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completion = await (engine as any).chatCompletion({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: config?.temperature ?? 0.7,
    top_p: config?.topP ?? 0.95,
    max_tokens: config?.maxTokens ?? 1024,
    repetition_penalty: config?.repetitionPenalty ?? 1.1,
    stream: false,
  });

  const elapsed = (performance.now() - startTime) / 1000;
  const content = completion.choices?.[0]?.message?.content ?? '';

  const result: ChatResult = {
    message: { role: 'assistant', content },
    tokensGenerated: completion.usage?.completion_tokens ?? 0,
    tokensPerSec: completion.usage?.completion_tokens
      ? completion.usage.completion_tokens / elapsed
      : 0,
  };

  return result;
}

function readChunkText(chunk: unknown): string {
  const delta = (chunk as {
    choices?: Array<{
      delta?: { content?: string | Array<{ text?: string }> };
      message?: { content?: string | Array<{ text?: string }> };
    }>;
  })?.choices?.[0];

  const content = delta?.delta?.content ?? delta?.message?.content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
  }

  return '';
}

export async function chatStream(
  messages: ChatMessage[],
  config: ChatConfig | undefined,
  onProgress?: (progress: ChatStreamProgress) => void,
): Promise<ChatResult> {
  if (!engine) throw new Error('Engine not loaded');

  status = 'ready';

  const startTime = performance.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completion = await (engine as any).chatCompletion({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: config?.temperature ?? 0.7,
    top_p: config?.topP ?? 0.95,
    max_tokens: config?.maxTokens ?? 1024,
    repetition_penalty: config?.repetitionPenalty ?? 1.1,
    stream: true,
  });

  if (!completion || typeof completion[Symbol.asyncIterator] !== 'function') {
    const result = await chat(messages, config);
    onProgress?.({
      text: result.message.content,
      chunkText: result.message.content,
      tokensGenerated: result.tokensGenerated,
      tokensPerSec: result.tokensPerSec,
    });
    return result;
  }

  let text = '';
  let tokensGenerated = 0;

  for await (const chunk of completion as AsyncIterable<unknown>) {
    const chunkText = readChunkText(chunk);
    if (chunkText.length > 0) {
      text += chunkText;
    }

    const usage = (chunk as { usage?: { completion_tokens?: number } }).usage;
    if (typeof usage?.completion_tokens === 'number') {
      tokensGenerated = usage.completion_tokens;
    }

    const elapsed = Math.max((performance.now() - startTime) / 1000, 0.001);
    onProgress?.({
      text,
      chunkText,
      tokensGenerated,
      tokensPerSec: tokensGenerated > 0 ? tokensGenerated / elapsed : 0,
    });
  }

  const elapsed = Math.max((performance.now() - startTime) / 1000, 0.001);
  return {
    message: { role: 'assistant', content: text },
    tokensGenerated,
    tokensPerSec: tokensGenerated > 0 ? tokensGenerated / elapsed : 0,
  };
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!engine) throw new Error('Engine not loaded');

  const embeddings: number[][] = [];
  for (const text of texts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (engine as any).embedding({
      input: text,
    });
    embeddings.push(result.data?.[0]?.embedding ?? []);
  }

  return embeddings;
}

export async function unload(): Promise<void> {
  if (engine) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (engine as any).unload?.();
    engine = null;
    currentModel = null;
    status = 'unloaded';
    log.info('engine unloaded');
  }
}
