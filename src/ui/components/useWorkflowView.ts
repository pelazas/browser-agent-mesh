import { useMemo } from 'react';

interface WorkflowViewData {
  taskCount: number;
  completedCount: number;
  responseText: string | null;
  modelId: string | null;
  isProcessing: boolean;
  state: string;
}

interface WorkflowViewState {
  progress: number;
  hasResponse: boolean;
  responseText: string | null;
  modelLabel: string | null;
  statusText: string;
}

export function useWorkflowView(workflow: WorkflowViewData): WorkflowViewState {
  return useMemo(() => {
    const progress = workflow.taskCount > 0
      ? Math.round((workflow.completedCount / workflow.taskCount) * 100)
      : 0;

    return {
      progress,
      hasResponse: typeof workflow.responseText === 'string' && workflow.responseText.trim().length > 0,
      responseText: workflow.responseText,
      modelLabel: workflow.modelId,
      statusText: workflow.isProcessing ? 'Processing' : workflow.state,
    };
  }, [workflow]);
}
