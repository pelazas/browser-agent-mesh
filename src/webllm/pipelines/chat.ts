import { chat } from '../engine';
import type { ChatMessage, ChatConfig, ChatResult } from '../engine';

export interface RAGContext {
  query: string;
  documents: string[];
  instruction?: string;
}

export async function ragCompletion(ctx: RAGContext, config?: ChatConfig): Promise<ChatResult> {
  const systemPrompt = ctx.instruction ??
    'You are a helpful research assistant. Answer the query based on the provided documents. If the documents do not contain relevant information, say so clearly.';

  const docContext = ctx.documents
    .map((doc, i) => `[Document ${i + 1}]:\n${doc}`)
    .join('\n\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Documents:\n${docContext}\n\nQuery: ${ctx.query}` },
  ];

  return chat(messages, config);
}

export async function summarize(text: string, maxLength?: number): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'Summarize the following text concisely. Preserve key facts and findings.' },
    { role: 'user', content: text },
  ];

  const result = await chat(messages, {
    maxTokens: maxLength ?? 512,
    temperature: 0.3,
  });

  return result.message.content;
}

export async function classify(text: string, categories: string[]): Promise<{ category: string; confidence: number }> {
  const categoryList = categories.join('", "');
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `Classify the following text into exactly one of these categories: ["${categoryList}"]. Respond with ONLY the category name, nothing else.`,
    },
    { role: 'user', content: text },
  ];

  const result = await chat(messages, {
    temperature: 0.0,
    maxTokens: 50,
  });

  const response = result.message.content.trim();
  const matched = categories.find((c) => response.toLowerCase().includes(c.toLowerCase()));

  return {
    category: matched ?? 'unknown',
    confidence: matched ? 0.9 : 0.3,
  };
}
