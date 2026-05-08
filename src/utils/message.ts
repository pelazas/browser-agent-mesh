export interface WorkerMessage {
  type: string;
  payload?: unknown;
  id?: string;
}

export interface MessageResponse {
  id: string;
  type: string;
  payload?: unknown;
  error?: string;
}

export function encodeMessage(type: string, payload?: unknown, id?: string): WorkerMessage {
  return { type, payload, id };
}

export function encodeResponse(
  requestId: string,
  type: string,
  payload?: unknown,
  error?: string,
): MessageResponse {
  return { id: requestId, type, payload, error };
}

export function isWorkerMessage(msg: unknown): msg is WorkerMessage {
  return typeof msg === 'object' && msg !== null && 'type' in msg;
}

export function isResponse(msg: unknown): msg is MessageResponse {
  return typeof msg === 'object' && msg !== null && 'id' in msg;
}
