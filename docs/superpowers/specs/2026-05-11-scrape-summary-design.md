# Scrape Summary Design

## Goal

Make `scrape <document-url>` workflows return a human-readable, somewhat detailed summary instead of raw serialized scrape payloads.

## Problem

The current scrape workflow has two issues:

1. The `reduce` task in `src/agents/worker/worker.ts` is a stub and does not process scraped content.
2. The synthesizer reducer in `src/agents/synthesizer/reducer.ts` serializes task results with `JSON.stringify`, which causes document workflows to surface raw scrape JSON and noisy extracted text.

This means the workflow shape is correct in principle (`scrape` then `reduce`), but the second step is not implemented, so the final result is not useful.

## Desired Behavior

For prompts like:

`scrape https://docs.aws.amazon.com/pdfs/prescriptive-guidance/latest/cloud-design-patterns/cloud-design-patterns.pdf`

the workflow should:

1. Extract the raw document text in the `scrape` task.
2. Process that raw text in the `reduce` task.
3. Return a somewhat detailed final summary that reads like a document overview, not like debug output.

The final response should include:

- document title when available
- a short overview paragraph
- key sections or themes
- notable takeaways or patterns discussed

The raw scrape result should remain available in task results for debugging and future reuse.

## Chosen Approach

Implement a real scrape-aware reduce path and make the final synthesis prefer that processed result.

This keeps responsibilities aligned with the DAG:

- `scrape` extracts
- `reduce` processes and structures
- `synthesizer` publishes the best final workflow output

## Alternatives Considered

### 1. Summarize inside `scrape`

Rejected because it mixes extraction and interpretation, makes raw scrape results less reusable, and bypasses the intended workflow structure.

### 2. Only change synthesizer formatting

Rejected because it would hide the symptom without implementing the missing `reduce` behavior. The workflow would still contain a no-op processing step.

### 3. Add a real scrape-specific reduce implementation

Chosen because it is the smallest correct fix that matches the existing architecture.

## Architecture

### Scrape task

No major behavior change is required here for this task. It should continue returning structured extracted content, including document text for PDFs.

### Reduce task

`reduce` should inspect predecessor task results and detect when the inputs include `scrape_result` fragments.

For scrape inputs, it should:

1. extract the text payload from the scrape result
2. normalize obvious reader noise
3. derive a readable document title if available
4. identify key sections or section headings when possible
5. generate a structured summary object

The result shape should be explicit, for example:

```ts
{
  type: 'reduce_result',
  sourceType: 'scrape_result',
  title: string | null,
  summary: string,
  sections: string[],
  takeaways: string[],
  confidence: number,
}
```

This should be deterministic and text-rule-based, not LLM-based.

### Synthesizer

The synthesizer should present `reduce_result` outputs cleanly.

When a workflow includes a downstream `reduce_result`, the final human-facing content should prefer that processed summary instead of dumping upstream scrape JSON. Raw scrape fragments can still be preserved in `fragments` metadata if they survive filtering, but the top-level `content` should read naturally.

## Data Flow

1. Sentinel creates `scrape` -> `reduce`
2. Bridge writes `scrape_result`
3. Worker reads predecessor `scrape_result` and writes `reduce_result`
4. Synthesizer consolidates completed nodes, preferring processed reduce output for final content

## Cleaning Rules

The reduce implementation should remove or suppress obvious extraction noise when present, including patterns like:

- `Title:` metadata lines
- `URL Source:` metadata lines
- `Published Time:` metadata lines
- `Markdown Content:` labels
- repeated document headers and footer markers
- page markers such as `> iii`, `> iv`, or similar OCR/page artifacts when safely detected

The cleaning should be conservative. It should not attempt aggressive rewriting that risks deleting meaningful content.

## Summary Rules

The summary should be somewhat detailed by default.

Target structure:

1. Title line
2. Overview paragraph
3. `Key Sections` list
4. `Notable Takeaways` list

If the document is too short or headings are sparse, the reduce step should still produce the same structure, filling sections from the best available signals in the text.

## Error Handling

- If a reduce task has no usable predecessor scrape content, fail clearly instead of returning placeholder text.
- If text cleanup yields very little content, produce a minimal summary from the remaining text rather than raw JSON.
- Non-scrape reduce behavior should remain unchanged unless required by the implementation.

## Testing Strategy

Use TDD.

Required coverage:

1. worker reduce test proving scrape inputs produce a structured `reduce_result`
2. test that noisy document-reader metadata is stripped from summary content
3. synthesizer test proving final workflow content prefers processed reduce output over raw scrape JSON
4. regression coverage showing the document workflow returns readable summary content for scraped PDF text

## Scope

In scope:

- implement scrape-aware reduce processing
- improve final synthesis formatting for processed reduce outputs
- update docs that describe scrape/reduce/synthesis output behavior

Out of scope:

- LLM-powered summarization
- changing prompt routing
- changing scrape result storage semantics beyond what is needed for the final summary behavior
- broad refactors of non-scrape reduce workflows

## Success Criteria

A plain `scrape <pdf-url>` prompt should no longer return raw `scrape_result` JSON in the final human-facing response. It should return a readable, somewhat detailed summary generated by the `reduce` step, while preserving raw extracted task data internally.
