# Architecture: Browser Agent Mesh

A decentralized, P2P browser-based agent swarm. Multiple browser tabs collaborate autonomously to execute AI workflows without a central server. Agent workflows (sequential, parallel, conditional, iterative) are managed implicitly via a shared CRDT (Yjs) Blackboard synced across WebRTC.

---

## Core Paradigms

1. **WebWorker Isolation** — Every agent runs in its own dedicated WebWorker thread to prevent blocking the main UI thread. Model weights (WebLLM/WebGPU) and memory (OPFS SQLite) are scoped to the worker.

2. **The CRDT Blackboard** — Agents do not communicate via direct REST/RPC calls. They observe a shared state object (managed by Yjs). When the state matches a node's entry condition in the distributed graph, the agent executes its logic and mutates the state.

3. **P2P Model Context Protocol (MCP)** — Agents expose their local capabilities (DOM access, OPFS files, network APIs) to the swarm using MCP over `libp2p` data channels.

4. **Single Network SharedWorker per browser** — The libp2p swarm, Yjs WebRTC sync, and MCP server live in a single SharedWorker. Agent workers communicate with it via `MessagePort`. This prevents duplicate WebRTC connections.

---

## Agent Roles

### Sentinel (Router)
- **Trigger:** Pending prompt requests on the blackboard (`promptRequests`)
- **Writes:** DAG of tasks into `activeWorkflows[workflowId].dag`
- **Does not:** run LLMs or heavy compute
- **File:** `src/agents/sentinel/sentinel.ts`

### Node Worker (Executor)
- **Trigger:** Unclaimed `llm_inference` or `retrieve` task on the Blackboard
- **Claims** tasks via CRDT lock to prevent duplicate execution
- **Runs:** WebLLM inference via WebGPU, RAG pipelines, embeddings
- **File:** `src/agents/worker/worker.ts`

### Bridge (MCP Tool Agent)
- **Trigger:** DAG-ready `scrape` tasks on the Blackboard
- **Claims** tasks via CRDT lock to prevent duplicate execution
- **Does:** Web scraping. It attempts direct browser `fetch()` first, then retries through the optional `VITE_CORS_PROXY_URL` proxy when the browser throws a cross-origin `TypeError`. Writes structured scrape results back to the DAG task node, OPFS read/write, format+stream data
- **Does not:** run LLMs
- **File:** `src/agents/bridge/bridge.ts`

### Synthesizer (Reduce Agent)
- **Trigger:** All tasks in a workflow marked `completed`
- **Does:** Consolidates completed task outputs into a final structured workflow result on the Blackboard
- **Triggers:** HITL prompts if confidence scores are low
- **File:** `src/agents/synthesizer/synthesizer.ts`

---

## Data Flow

```
User prompt → UI → Blackboard.promptRequests[requestId]
                        │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
      Sentinel      Node Workers    Bridge Agents
      (claims       (claim +        (claim +
       prompt,       execute LLM)    execute scrape)
        builds DAG)
          │              │              │
          └──────────────┼──────────────┘
                        ▼
              All write results to Blackboard
                        │
                        ▼
                  Synthesizer
                  (consolidate + HITL)
                        │
                        ▼
                    Final output on Blackboard → UI workflow cards
```

---

## Messaging Architecture

```
┌── Main Thread (UI) ───────────────────────────┐
│  React App, Blackboard hooks                   │
│  ┌──────────────────────────────────────┐     │
│  │  Network SharedWorker (singleton)     │     │
│  │  ├─ YjsSyncProvider (y-webrtc)       │     │
│  │  ├─ Root Y.Doc                       │     │
│  │  ├─ MCP Server                       │     │
│  │  └─ GossipTelemetry                  │     │
│  └──────┬──────┬──────┬──────┬─────────┘     │
│    Port │ Port │ Port │ Port │                 │
│    ┌────▼──┐ ┌─▼───┐┌▼────┐┌▼──────────┐     │
│    │Sentinel│ │Node ││Bridge││Synthesizer│     │
│    │ Worker │ │Worker││Worker││  Worker   │     │
│    └────────┘ └─────┘└────┘└───────────┘     │
└───────────────────────────────────────────────┘
```

- **WorkerSyncProvider** (`src/core/blackboard/worker-provider.ts`) handles Yjs sync over MessagePort between agent workers and the Network SharedWorker.
- **y-webrtc** syncs the root Y.Doc between browser tabs via WebRTC data channels.
- **Signaling server** (`signaling-server/`) is a WebSocket relay for y-webrtc peer discovery.

---

## System Design

- **Event Sourcing:** Every CRDT mutation is appended to an immutable append-only log in OPFS SQLite.
- **Telemetry:** Agents broadcast VRAM usage, token generation speed, and peer count via Gossipsub. UI renders real-time mesh health.
- **Persistence:** SQLite WASM in OPFS stores the event log and periodic Y.Doc checkpoints. On tab reload, agents re-sync with the mesh and resume execution.
- **UI Observability:** The React UI observes both `promptRequests` and `activeWorkflows` so users can see queued/routing activity before a workflow exists, then live workflow progress, streamed LLM partial output/model selection while inference is running, and final outputs once tasks complete. Node metadata is grouped by shared `tabId` so hover cards and topology tiles represent browser tabs rather than individual agent workers.
- **Scraper Proxy Config:** Set `VITE_CORS_PROXY_URL` to a proxy base URL that accepts `?url=<encoded-target-url>` when cross-origin targets do not emit CORS headers.
