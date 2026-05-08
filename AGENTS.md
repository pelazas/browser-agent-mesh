# Agent Architecture: Browser Agent Mesh

This document outlines the design, lifecycles, and roles of the autonomous agents operating within the decentralized browser mesh. 

Unlike traditional centralized agent frameworks where a single Python process manages state, the application mesh uses a **Decentralized State Graph**. Agent workflows (sequential, parallel, conditional, and iterative) are managed implicitly via a shared CRDT (Conflict-free Replicated Data Type) Blackboard synced across WebRTC.

---

## Core Paradigms

1. **WebWorker Isolation:** Every agent runs in its own dedicated WebWorker thread to prevent blocking the main UI thread. Model weights (via WebLLM/WebGPU) and memory (via OPFS SQLite) are scoped to the worker.
2. **The CRDT Blackboard:** Agents do not communicate via direct REST/RPC calls. They observe a shared state object (managed by Yjs). When the state matches a node's entry condition in the distributed graph, the agent executes its logic and mutates the state.
3. **P2P Model Context Protocol (MCP):** Agents expose their local capabilities (e.g., access to a specific tab's DOM, local OPFS files, or local network APIs) to the swarm using MCP over `libp2p` data channels. 

---

## Agent Roles (The Swarm Typology)

In the mesh, not all browser tabs are equal. Depending on the device's hardware (e.g., mobile vs. M-series Mac) and available context, agents dynamically assume different roles.

### 1. The Sentinel (Router Agent)
The Sentinel is the orchestrator. It does not perform heavy lifting; it manages the topology of the distributed graph.
* **Responsibilities:**
  * Parses complex user prompts into discrete, executable sub-tasks.
  * Defines the workflow routing (e.g., deciding if tasks should run in a parallel fan-out or a sequential chain).
  * Writes the initial state schema to the Blackboard.
* **Trigger:** User input from the UI.
* **Output:** A DAG (Directed Acyclic Graph) of pending tasks appended to the shared state.

### 2. The Node Worker (Executor Agent)
The core compute unit of the swarm. Node Workers constantly poll the Blackboard for unassigned tasks that match their hardware profile.
* **Responsibilities:**
  * Runs hardware-accelerated LLM inference directly in the browser via WebGPU.
  * Claims tasks using a lightweight CRDT lock to prevent duplicate execution across the mesh.
  * Executes standard RAG (Retrieval-Augmented Generation) or summarization over chunked data.
* **Trigger:** An unassigned task on the Blackboard.
* **Output:** Intermediate reasoning steps or generated text/embeddings appended to the task state.

### 3. The Bridge (MCP / Tool Agent)
Bridge agents do not run LLMs. Instead, they act as secure gateways to the local device's resources, exposing them to the rest of the swarm via the Model Context Protocol.
* **Responsibilities:**
  * Executing Web scraping on specific origins without CORS issues (since they run in the browser).
  * Reading/Writing to the local OPFS.
  * Formatting local data and streaming it back to a Node Worker via WebRTC.
* **Trigger:** A Tool Call request published to the Blackboard by a Node Worker.

### 4. The Synthesizer (Reduce Agent)
Watches conditional edges in the distributed graph. When a parallel workflow completes (e.g., 5 Node Workers finish reading 5 different PDFs), the Synthesizer wakes up.
* **Responsibilities:**
  * Consolidates parallel outputs into a cohesive final payload.
  * Triggers human-in-the-loop (HITL) prompts if confidence scores are low or tools require explicit permission.
* **Trigger:** All prerequisite conditional edges in a workflow state marked as `COMPLETED`.

---

## Distributed Workflow Example: "The P2P CRAG"

Here is how a Corrective RAG (CRAG) workflow executes across multiple devices without a central server:

1. **Instantiation:** User requests a research summary on a new topic.
2. **Sentinel Routing:** The Sentinel agent (Tab A) writes the query to the Blackboard.
3. **Parallel Retrieval:** Three Bridge agents (Tabs B, C, D) claim retrieval tasks. They scrape different sources and chunk the text, persisting the raw data to their local OPFS.
4. **Conditional Evaluation:** Node Workers (Tabs A, E) read the chunks via WebTorrent-style piece sharing. They evaluate the relevance of the retrieved documents (the "Corrective" step).
5. **Iterative Refinement:** If a document is irrelevant, a Node Worker writes a new retrieval task back to the Blackboard (Iterative loop).
6. **Final Synthesis:** Once the document set is validated, the Synthesizer agent compiles the final response and updates the UI state.

---

## System Design & Observability

Tracing a decentralized graph is notoriously difficult. To maintain system design rigor:

* **Event Sourcing:** Every mutation to the CRDT Blackboard is appended to an immutable append-only log stored in the OPFS.
* **Telemetry:** Agents broadcast lightweight heartbeat and performance metrics (VRAM usage, token generation speed) via `libp2p` Gossipsub, allowing the local UI to render a real-time visualization of the mesh's health.
* **Persistence:** If a user closes the tab mid-generation, the agent's memory is safely parked in the local SQLite WASM database. Upon reloading, the node automatically re-syncs with the mesh's Yjs document and resumes execution.