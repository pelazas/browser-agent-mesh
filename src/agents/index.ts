export { BaseAgent } from './base';
export type { AgentConfig } from './base';

export { SentinelAgent } from './sentinel';
export { NodeWorkerAgent, runRAG, claimTask, releaseTask } from './worker';
export type { RAGInput, RAGOutput } from './worker';
export { BridgeAgent, scrape, readFile, writeFile, listFiles, ToolRegistry } from './bridge';
export type { ScrapeOptions } from './bridge';
export {
  SynthesizerAgent,
  consolidate,
  mergeByConfidence,
  deduplicate,
  requestHumanInput,
  shouldRequestApproval,
} from './synthesizer';
export type { FragmentOutput, HITLRequest, HITLResponse, ApprovalAction } from './synthesizer';
