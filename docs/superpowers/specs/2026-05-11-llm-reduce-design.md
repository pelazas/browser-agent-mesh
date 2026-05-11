# LLM-Based Reduce Summarization Design

## Goal
Replace heuristic text extraction in the `reduce` task with LLM-powered summarization so that `scrape <pdf-url>` workflows return actually human-readable summaries.

## Problem
Current heuristics produce structured but noisy output: hundreds of heading items, page markers, repeated copyright text, etc. For a 154-page PDF the result is not readable.

## Approach
Use the existing WebLLM `chatStream()` call inside the worker's `reduce` execution path.

**Prompt strategy:**
Single structured prompt asking the LLM to summarize extracted text and return JSON:

```
You are a document summarizer. Read the text below and return ONLY a JSON object with this exact shape (no markdown code blocks, no extra text):

{"title":"...","summary":"2-3 paragraph overview","sections":["Key topic 1","Key topic 2",...],"takeaways":["Notable insight 1","Notable insight 2",...]}

Keep sections and takeaways concise. Limit sections to 6 items and takeaways to 5 items.

Document text:
---
{truncatedText}
```

**Truncation:**
- If cleaned text exceeds ~30,000 characters (~15K tokens safe for Llama 3.2 3B), truncate with a trailing `\n\n[Document truncated]` notice.

**Parsing:**
- Attempt `JSON.parse()` on the raw assistant response.
- If parsing fails, strip markdown code fences and retry.
- If still failing, fall back to the heuristic reduce (current behavior) so the workflow doesn't crash.

**Model loading:**
- Call `ensureModelReady()` before inference, same pattern as `llm_inference` tasks.

## Result Shape
Keeps the existing `reduce_result` interface:
```ts
{
  type: 'reduce_result';
  sourceType: 'scrape_result';
  title: string | null;
  summary: string;
  sections: string[];
  takeaways: string[];
  confidence: number;
}
```

## Error Handling
- Missing workflowId → throw (existing)
- No scrape predecessor → return placeholder (existing, preserves non-scrape reduce)
- Empty after cleanup → throw (existing)
- LLM not ready → throw with clear message
- LLM produces unparseable output → fallback to heuristic reduce, log warning

## Testing
- TDD: write failing test asserting that reduce with scrape content calls `chatStream` and returns parsed LLM output
- Mock `chatStream` to return JSON in tests
- Add test for truncation behavior
- Add test for JSON parse fallback

## Out of Scope
- Multi-chunk summarization for documents exceeding context window
- Streaming reduce output (reduce runs in worker, no preview needed)
- Changing prompt routing or workflow shape
