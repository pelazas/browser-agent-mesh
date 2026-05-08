# Browser Agent Mesh — Agent Instructions

A decentralized, P2P browser-based agent swarm. Multiple browser tabs collaborate via a shared CRDT Blackboard (Yjs synced over WebRTC) to execute AI workflows without a central server.

---

## Before Writing Any Code

**Read the relevant documents first. These are not optional — code must be compliant with them.**

| Document | Contents | When to read |
|----------|----------|--------------|
| `documents/architecture.md` | Full system architecture, agent roles, data flow, messaging | Before any change |
| `documents/data-reference.md` | All schemas, types, Y.Doc structure, message protocol, graph types | Before editing schemas or blackboard code |
| `documents/file-structure.md` | Full directory map, import aliases, where each feature lives | Before adding new files |
| `AGENTS.md` | This file — rules, workflow, conventions | Always |

**These documents are the source of truth.** If you change code that affects any documented behavior, you MUST update the relevant document(s) in the same commit.

---

## File Structure Quick Reference

| Feature | Entry Point |
|---------|------------|
| App bootstrap | `src/main.ts` |
| Global config | `src/config.ts` |
| CRDT Blackboard (schemas) | `src/core/blackboard/schema.ts` |
| CRDT Blackboard (Y.Doc factory) | `src/core/blackboard/root-doc.ts` |
| Worker sync protocol | `src/core/blackboard/worker-provider.ts` |
| CRDT distributed locks | `src/core/blackboard/lock.ts` |
| Yjs + WebRTC sync | `src/core/network/sync.ts` |
| libp2p swarm | `src/core/network/swarm.ts` |
| MCP tool protocol | `src/core/network/mcp/` |
| OPFS SQLite persistence | `src/core/persistence/` |
| DAG workflow engine | `src/core/graph/dag.ts` |
| Task scheduler | `src/core/graph/scheduler.ts` |
| Edge condition validator | `src/core/graph/validator.ts` |
| GPU profiling | `src/webllm/profiles.ts` |
| WebLLM engine | `src/webllm/engine.ts` |
| All agent implementations | `src/agents/` |
| Worker entry points | `src/workers/` |
| React UI components | `src/ui/` |
| Signaling server | `signaling-server/src/server.ts` |
| Tests | `tests/` |
| Dev/build scripts | `scripts/` |

---

## Coding Rules

### 1. Component size limit (React)
**No component file may exceed 150 lines.** If a component grows past this, split it into smaller sub-components in the same directory. The split should be along semantic boundaries (separate logical sections, not arbitrary chunks).

### 2. Separate UI from logic (React)
**Always separate rendering from logic.** Keep JSX/rendering in the component file; move state management, effects, event handlers, and data transformation into a co-located `use<Name>.ts` hook file.

Example:
```
src/ui/components/MyFeature.tsx      # JSX only, imports useMyFeature
src/ui/components/useMyFeature.ts    # State, effects, handlers
```

### 3. Bug fix workflow
When a bug is reported:
1. **Write a failing test** that reproduces the bug BEFORE attempting any fix.
2. **Confirm the test fails** as expected (proving it catches the bug).
3. **Use subagents to explore multiple fix approaches** in parallel.
4. **A fix is only accepted when the test passes.** Do not merge or move on until the new test is green.

### 4. Commit granularity
**One commit per small, self-contained task.** Do not bundle unrelated changes. If a single feature involves changes to multiple files that are all part of the same logical change, one commit is acceptable. But changing the signaling server AND adding a UI component in one commit is not.

### 5. TypeScript strictness
- `noUnusedLocals: true` — unused imports will fail the build.
- Use path aliases (`@core/`, `@agents/`, `@ui/`, etc.) for all imports — never use relative paths like `../../core/...`.
- All new code must be fully typed. No `any` except when interfacing with untyped libraries (must be commented with `// eslint-disable-next-line`).

### 6. Yjs mutations
- Always use `doc.transact(() => { ... })` for multi-step Y.Doc mutations to avoid dirty intermediate states.
- CRDT locks use TTL-based expiry. Always release locks in `finally` blocks.
- The `lock.ts` module handles lock acquisition, release, and TTL extension. Do not manipulate lock entries directly.

---

## Testing

```bash
npm test                    # Unit tests (vitest)
npm run test:watch          # Watch mode
npm run test:e2e            # E2E tests (playwright)

# From scripts/
./scripts/test.sh unit      # Unit tests
./scripts/test.sh e2e       # E2E tests
```

- Unit tests live in `tests/unit/` and test core logic (DAG, validator, lock, ID generation).
- E2E tests live in `tests/e2e/` and test the running application.
- Write tests for all new features. Bug fixes require a regression test first (see rule 3).

---

## Development

```bash
# Native (no Docker)
./scripts/dev.sh            # installs deps, starts signaling server + vite

# Docker
./scripts/docker-up.sh dev  # foreground with logs
./scripts/docker-up.sh up   # background
./scripts/docker-up.sh down # stop

# Build
./scripts/build.sh          # install → typecheck → vite build
```

### Browser requirements
- **WebGPU** required for Node Workers (LLM inference)
- **SharedWorker** required for the network coordination layer
- **COOP/COEP headers** (set by Vite dev server and nginx) required for SharedArrayBuffer

### Debugging the Blackboard
- In-browser panel: click `▸ Blackboard` in the sidebar
- Console: `window.__MESH_BLACKBOARD__.dump()`, `.getNodes()`, `.getWorkflows()`
- Peer count: `window.__MESH_NETWORK__.peerCount`
- SharedWorker console: `chrome://inspect/#workers` → `bam-network`
