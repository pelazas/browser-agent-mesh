import React from 'react';

interface WorkflowViewProps {
  workflowId: string;
  prompt: string;
  state: string;
  taskCount: number;
  completedCount: number;
  failedCount: number;
}

export const WorkflowView: React.FC<WorkflowViewProps> = ({
  workflowId,
  prompt,
  state,
  taskCount,
  completedCount,
  failedCount,
}) => {
  const progress = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;

  return (
    <div className={`workflow-view workflow-view--${state}`}>
      <div className="workflow-view__header">
        <span className="workflow-view__id">{workflowId.slice(0, 8)}</span>
        <span className="workflow-view__state">{state}</span>
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
    </div>
  );
};
