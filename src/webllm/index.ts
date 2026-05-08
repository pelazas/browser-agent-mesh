export {
  loadModel,
  chat,
  embed,
  unload,
  getEngineStatus,
  getCurrentModel,
} from './engine';
export type { EngineStatus, ChatMessage, ChatConfig, ChatResult } from './engine';

export {
  getAvailableModels,
  getModelById,
  selectBestModel,
  warmupCache,
} from './model-loader';
export type { ModelEntry } from './model-loader';

export { profileGPU } from './profiles';

export { ragCompletion, summarize, classify } from './pipelines/chat';
export { embedDocuments, cosineSimilarity, topKSimilar } from './pipelines/embedding';
export type { ChunkWithEmbedding } from './pipelines/embedding';
