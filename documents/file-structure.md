# File Structure

Every high-level feature with its location in the codebase.

```
browser-agent-mesh/
├── src/
│   ├── main.ts                          # Entry point: worker bootstrap, UI mount
│   ├── config.ts                        # Global config (env vars, intervals, constants)
│   │
│   ├── core/
│   │   ├── index.ts                     # Barrel export for all core modules
│   │   ├── blackboard/
│   │   │   ├── schema.ts                # All TypeScript types (TaskNode, Edge, etc.)
│   │   │   ├── root-doc.ts              # Y.Doc factory + getter functions
│   │   │   ├── observer.ts              # Path-based Y.Doc mutation watcher
│   │   │   ├── lock.ts                  # CRDT distributed lock (acquire/release/extend)
│   │   │   └── worker-provider.ts       # Yjs sync over MessagePort + message types
│   │   │
│   │   ├── network/
│   │   │   ├── index.ts                 # Network barrel export
│   │   │   ├── swarm.ts                 # libp2p node bootstrap + peer discovery
│   │   │   ├── sync.ts                  # YjsSyncProvider (y-webrtc wrapper)
│   │   │   ├── gossip.ts                # Gossipsub telemetry heartbeat
│   │   │   └── mcp/
│   │   │       ├── types.ts             # MCP message types + protocol constants
│   │   │       ├── server.ts            # Tool registration + execution
│   │   │       └── client.ts            # Remote tool discovery + RPC invocation
│   │   │
│   │   ├── persistence/
│   │   │   ├── index.ts                 # Persistence barrel export
│   │   │   ├── database.ts              # SQLite WASM init on OPFS
│   │   │   ├── event-log.ts             # Append-only CRDT mutation log
│   │   │   └── checkpoint.ts            # Periodic Y.Doc snapshots for crash recovery
│   │   │
│   │   ├── graph/
│   │   │   ├── index.ts                 # Graph barrel export
│   │   │   ├── types.ts                 # WorkflowGraph, ScheduledStep, ExecutionPlan
│   │   │   ├── dag.ts                   # DAG: nodes/edges CRUD, topological sort, ready detection
│   │   │   ├── scheduler.ts             # Capability-based task-to-node assignment
│   │   │   └── validator.ts             # Conditional edge + precondition evaluation
│   │   │
│   │   └── telemetry/
│   │       ├── index.ts
│   │       ├── collector.ts             # CPU/VRAM/tokens-per-sec measurement
│   │       └── reporter.ts              # Write to blackboard + gossip broadcast
│   │
│   ├── agents/
│   │   ├── index.ts                     # Agent barrel export
│   │   ├── base.ts                      # Abstract BaseAgent (doc, provider, run/stop)
│   │   ├── sentinel/
│   │   │   ├── index.ts
│   │   │   └── sentinel.ts              # Prompt → DAG decomposition, heuristic parser
│   │   ├── worker/
│   │   │   ├── index.ts
│   │   │   ├── worker.ts                # Poll + claim + execute loop, CRDT lock integration
│   │   │   ├── inference.ts             # WebLLM inference runner
│   │   │   ├── rag.ts                   # RAG pipeline (retrieve → evaluate → generate)
│   │   │   ├── claimer.ts               # Task claiming helper (wraps lock.ts)
│   │   │   └── pdf-summary.ts           # PDF/document cleanup, body detection, chunking
│   │   ├── bridge/
│   │   │   ├── index.ts
│   │   │   ├── bridge.ts                # Tool call polling + execution
│   │   │   ├── scraper.ts               # Web scraping (fetch + parse)
│   │   │   ├── filesystem.ts            # OPFS read/write/list operations
│   │   │   └── registry.ts              # MCP tool publication to blackboard
│   │   └── synthesizer/
│   │       ├── index.ts
│   │       ├── synthesizer.ts            # Parallel completion detection + consolidate
│   │       ├── reducer.ts               # Merge, deduplicate, confidence-filter outputs
│   │       └── hitl.ts                  # Human-in-the-loop prompt with timeout
│   │
│   ├── workers/
│   │   ├── network.shared.ts            # SharedWorker: root Y.Doc, y-webrtc, MCP, gossip
│   │   ├── sentinel.worker.ts           # Dedicated worker: Sentinel entry
│   │   ├── node.worker.ts               # Dedicated worker: Node Worker entry + GPU profiling
│   │   ├── bridge.worker.ts             # Dedicated worker: Bridge entry + tool registration
│   │   └── synthesizer.worker.ts        # Dedicated worker: Synthesizer entry
│   │
│   ├── webllm/
│   │   ├── index.ts                     # WebLLM barrel export
│   │   ├── engine.ts                    # WebLLM engine wrapper (load, chat, embed, unload)
│   │   ├── model-loader.ts              # Model catalog + VRAM-based selection
│   │   ├── profiles.ts                  # GPU detection + VRAM estimation + compute benchmark
│   │   └── pipelines/
│   │       ├── chat.ts                  # RAG completion, summarization, classification
│   │       └── embedding.ts             # Document embedding + cosine similarity top-K
│   │
│   ├── ui/
│   │   ├── index.ts                     # UI barrel export
│   │   ├── App.tsx                      # Root component: layout + data wiring
│   │   ├── context/
│   │   │   └── BlackboardContext.ts      # React context providing Y.Doc to component tree
│   │   ├── components/
│   │   │   ├── MeshGraph.tsx             # Node topology visualization grid
│   │   │   ├── PromptInput.tsx           # User prompt submission form
│   │   │   ├── usePromptInput.ts         # Prompt input state + submit handlers
│   │   │   ├── AgentCard.tsx             # Single agent status card (role, GPU, tasks)
│   │   │   ├── TelemetryPanel.tsx        # Real-time metrics list
│   │   │   ├── WorkflowView.tsx          # DAG progress bar + task counts
│   │   │   ├── useWorkflowView.ts        # Workflow card derived state (progress, response)
│   │   │   └── BlackboardDebugger.tsx    # Live CRDT state JSON tree viewer
│   │   ├── hooks/
│   │   │   ├── useBlackboard.ts          # Y.Doc → reactive React state (nodes, workflows, telemetry)
│   │   │   ├── useAppView.ts             # App-level view models for workflows and prompt status
│   │   │   └── useMesh.ts               # Network health (peer count, connection status)
│   │   └── styles/
│   │       └── main.css                  # Full application stylesheet (dark theme)
│   │
│   └── utils/
│       ├── id.ts                        # Lightweight unique ID generation
│       ├── logging.ts                   # Structured logger with levels
│       ├── message.ts                   # Worker message encode/decode helpers
│       └── retry.ts                     # Exponential backoff retry util
│
├── signaling-server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── src/
│       └── server.ts                    # WebSocket signaling relay for y-webrtc
│
├── nginx/
│   └── default.conf                     # Production nginx config (COOP/COEP headers)
│
├── tests/
│   ├── unit/
│   │   ├── id.test.ts                   # ID generation uniqueness
│   │   ├── dag.test.ts                  # DAG construction, topology, readiness
│   │   ├── validator.test.ts            # Conditional edge evaluation, field resolution
│   │   └── pdf-summary.test.ts          # PDF/document preparation helper coverage
│   └── e2e/
│       └── app.spec.ts                  # Page load, prompt input, mesh graph smoke tests
│
├── scripts/
│   ├── dev.sh                           # Native dev startup (signaling + vite)
│   ├── build.sh                         # CI: install → typecheck → vite build
│   ├── test.sh                          # Unit / watch / e2e test runner
│   └── docker-up.sh                     # Docker Compose lifecycle (dev, up, down, logs)
│
├── package.json
├── tsconfig.json
├── vite.config.ts                       # COOP/COEP headers, path aliases, worker format
├── vitest.config.ts
├── playwright.config.ts
├── docker-compose.yml                   # app + signaling + optional coturn
├── Dockerfile                            # Multi-stage: dev → build → nginx prod
└── .env.example
```

---

## Import Path Aliases

Configured in `tsconfig.json` and `vite.config.ts`:

| Alias | Resolves to |
|-------|------------|
| `@/` | `src/` |
| `@core/` | `src/core/` |
| `@agents/` | `src/agents/` |
| `@webllm/` | `src/webllm/` |
| `@workers/` | `src/workers/` |
| `@ui/` | `src/ui/` |
| `@utils/` | `src/utils/` |
