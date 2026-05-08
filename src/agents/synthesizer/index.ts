export { SynthesizerAgent } from './synthesizer';
export { consolidate, mergeByConfidence, deduplicate } from './reducer';
export type { FragmentOutput } from './reducer';
export { requestHumanInput, shouldRequestApproval } from './hitl';
export type { HITLRequest, HITLResponse, ApprovalAction } from './hitl';
