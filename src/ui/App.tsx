import React, { useCallback, useMemo } from 'react';
import { MeshGraph } from '@ui/components/MeshGraph';
import { PromptInput } from '@ui/components/PromptInput';
import { TelemetryPanel } from '@ui/components/TelemetryPanel';
import { WorkflowView } from '@ui/components/WorkflowView';
import { BlackboardDebugger } from '@ui/components/BlackboardDebugger';
import { useBlackboard } from '@ui/hooks/useBlackboard';
import { useNetworkHealth } from '@ui/hooks/useMesh';
import '@ui/styles/main.css';

interface MeshNodeUI {
  id: string;
  role: string;
  status: string;
  gpu?: string;
  tasks?: number;
}

interface MetricsEntryUI {
  nodeId: string;
  cpuUsage: number;
  vramUsedMB: number;
  tokensPerSec: number | null;
  peerCount: number;
  timestamp: number;
}

interface WorkflowUI {
  workflowId: string;
  prompt: string;
  state: string;
  taskCount: number;
  completedCount: number;
  failedCount: number;
}

export const App: React.FC = () => {
  const { nodes, workflows, telemetry } = useBlackboard();
  const networkHealth = useNetworkHealth();

  const meshNodes: MeshNodeUI[] = useMemo(() => {
    const result: MeshNodeUI[] = [];
    nodes.forEach((val: unknown, key: string) => {
      const data = val as Record<string, unknown>;
      if (!data) return;
      result.push({
        id: key,
        role: (data.role as string) ?? 'unknown',
        status: (data.status as string) ?? 'offline',
        gpu: data.gpu ? `${(data.gpu as Record<string, number>)?.vramEstimateMB}MB` : undefined,
        tasks: Array.isArray(data.tasks) ? (data.tasks as unknown[]).length : undefined,
      });
    });
    return result;
  }, [nodes]);

  const telemetryMetrics: MetricsEntryUI[] = useMemo(() => {
    const result: MetricsEntryUI[] = [];
    telemetry.forEach((val: unknown, key: string) => {
      const data = val as Record<string, unknown>;
      if (!data) return;
      result.push({
        nodeId: key,
        cpuUsage: (data.cpuUsage as number) ?? 0,
        vramUsedMB: (data.vramUsedMB as number) ?? 0,
        tokensPerSec: (data.tokensPerSec as number | null) ?? null,
        peerCount: (data.peerCount as number) ?? 0,
        timestamp: (data.timestamp as number) ?? Date.now(),
      });
    });
    return result;
  }, [telemetry]);

  const workflowList: WorkflowUI[] = useMemo(() => {
    const result: WorkflowUI[] = [];
    workflows.forEach((val: unknown, key: string) => {
      const data = val as Record<string, unknown>;
      if (!data) return;
      result.push({
        workflowId: key,
        prompt: (data.prompt as string) ?? '',
        state: (data.state as string) ?? 'active',
        taskCount: (data.taskCount as number) ?? 0,
        completedCount: (data.completedCount as number) ?? 0,
        failedCount: (data.failedCount as number) ?? 0,
      });
    });
    return result;
  }, [workflows]);

  const handlePromptSubmit = useCallback(
    (prompt: string) => {
      // In production: this writes to the blackboard,
      // the Sentinel agent picks it up and builds the DAG
      console.log('Prompt submitted:', prompt);
    },
    [],
  );

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Legion Browser Agent Mesh</h1>
        <div className="app__status">
          <span
            className={`app__status-dot${networkHealth.connected ? ' app__status-dot--connected' : ''}`}
          />
          <span>
            {networkHealth.connected
              ? `${networkHealth.peerCount} peers`
              : 'disconnected'}
          </span>
        </div>
      </header>

      <div className="app__grid">
        <div className="app__main">
          <PromptInput onSubmit={handlePromptSubmit} disabled={false} />

          <div style={{ marginTop: 24 }}>
            {workflowList.map((w) => (
              <WorkflowView key={w.workflowId} {...w} />
            ))}
            {workflowList.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>
                No active workflows. Enter a prompt to start.
              </div>
            )}
          </div>
        </div>

        <div className="app__sidebar">
          <MeshGraph nodes={meshNodes} />
          <TelemetryPanel metrics={telemetryMetrics} />
          <BlackboardDebugger />
        </div>
      </div>
    </div>
  );
};
