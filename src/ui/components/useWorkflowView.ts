import { useMemo, useState, useEffect } from 'react';
import type { TaskActivityEntry } from '@ui/hooks/useAppView';

interface WorkflowViewData {
  taskCount: number;
  completedCount: number;
  responseText: string | null;
  modelId: string | null;
  isProcessing: boolean;
  state: string;
  tasks: TaskActivityEntry[];
}

export interface ActivityViewEntry extends TaskActivityEntry {
  elapsedMs: number | null;
}

export interface WorkflowViewState {
  progress: number;
  hasResponse: boolean;
  responseText: string | null;
  modelLabel: string | null;
  statusText: string;
  activityEntries: ActivityViewEntry[];
  isSynthesizing: boolean;
}

function computeElapsed(startedAt: number | null, completedAt: number | null, now: number): number | null {
  if (startedAt == null) return null;
  if (completedAt != null) return completedAt - startedAt;
  return now - startedAt;
}

export function useWorkflowView(workflow: WorkflowViewData): WorkflowViewState {
  const [now, setNow] = useState(Date.now());

  const hasRunning = workflow.tasks.some((t) => t.status === 'running');
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [hasRunning]);

  return useMemo(() => {
    const progress = workflow.taskCount > 0
      ? Math.round((workflow.completedCount / workflow.taskCount) * 100)
      : 0;

    const hasResponse = typeof workflow.responseText === 'string' && workflow.responseText.trim().length > 0;
    const allDone = workflow.taskCount > 0 && workflow.completedCount === workflow.taskCount;
    const isSynthesizing = allDone && !hasResponse && workflow.state === 'active';

    const activityEntries: ActivityViewEntry[] = workflow.tasks.map((task) => ({
      ...task,
      elapsedMs: computeElapsed(task.startedAt, task.completedAt, now),
    }));

    return {
      progress,
      hasResponse,
      responseText: workflow.responseText,
      modelLabel: workflow.modelId,
      statusText: workflow.isProcessing ? 'Processing' : workflow.state,
      activityEntries,
      isSynthesizing,
    };
  }, [workflow, now]);
}
