import React from 'react';
import { useWorkflowView } from '@ui/components/useWorkflowView';

interface WorkflowViewProps {
  workflowId: string;
  prompt: string;
  state: string;
  taskCount: number;
  completedCount: number;
  failedCount: number;
  error: string | null;
  modelId: string | null;
  responseText: string | null;
  isProcessing: boolean;
}

export const WorkflowView: React.FC<WorkflowViewProps> = (props) => {
  const {
    workflowId,
    prompt,
    state,
    taskCount,
    completedCount,
    failedCount,
    error,
  } = props;
  const { progress, hasResponse, responseText, modelLabel, statusText } = useWorkflowView(props);

  return (
    <div className={`workflow-view workflow-view--${state}`}>
      <div className="workflow-view__header">
        <span className="workflow-view__id">{workflowId.slice(0, 8)}</span>
        <span className="workflow-view__state">{statusText}</span>
      </div>
      <div className="workflow-view__prompt">{prompt}</div>
      <div className="workflow-view__progress">
        <div className="workflow-view__bar">
          <div
            className="workflow-view__fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="workflow-view__stats">
          {completedCount}/{taskCount} tasks
          {failedCount > 0 && ` (${failedCount} failed)`}
        </span>
      </div>
      {modelLabel && <div className="workflow-view__meta">Model: {modelLabel}</div>}
      {hasResponse && <div className="workflow-view__response">{responseText}</div>}
      {!hasResponse && state === 'active' && (
        <div className="workflow-view__placeholder">Waiting for response fragments...</div>
      )}
      {error && <div className="workflow-view__error">{error}</div>}
    </div>
  );
};
