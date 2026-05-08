export const config = {
  signalingUrl: import.meta.env.VITE_SIGNALING_URL ?? 'ws://localhost:4444',
  stunServers: (
    import.meta.env.VITE_STUN_SERVERS ?? 'stun:stun.l.google.com:19302'
  ).split(','),
  modelCachePath: import.meta.env.VITE_MODEL_CACHE_PATH ?? '/models',
  maxVramMB: parseInt(import.meta.env.VITE_MAX_VRAM_MB ?? '0', 10),
  debug: import.meta.env.VITE_DEBUG === 'true',
  roomName: 'browser-agent-mesh',
  agentPollIntervalMs: 2000,
  telemetryIntervalMs: 10_000,
  lockTtlMs: 30_000,
  checkpointIntervalMs: 60_000,
  maxBootstrapPeers: 5,
  gossipTopic: '/bam-telemetry/1.0.0',
  mcpProtocol: '/bam-mcp/1.0.0',
} as const;
