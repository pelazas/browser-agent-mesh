import React from 'react';
import { KeywordText } from '@ui/components/KeywordText';
import { MarkdownRenderer } from '@ui/components/MarkdownRenderer';
import { useWorkflowView, type ActivityViewEntry } from '@ui/components/useWorkflowView';
import type { WorkflowCardView } from '@ui/hooks/useAppView';

type WorkflowViewProps = WorkflowCardView;

const STATUS_LABELS: Record<string, string> = {
  pending: 'pending',
  claimed: 'claimed',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function shortModel(modelId: string): string {
  const name = modelId.split('/').pop() ?? modelId;
  return name.split('-').slice(0, 2).join('-');
}

const TelemetryLine: React.FC<{ entry: ActivityViewEntry }> = ({ entry }) => {
  const parts: string[] = [];
  const modelId = entry.modelId;
  if (modelId) parts.push(shortModel(modelId));
  if (entry.claimedBy) parts.push(entry.claimedBy.slice(0, 8));
  if (entry.tokensPerSec != null) parts.push(`${Math.round(entry.tokensPerSec)} tok/s`);
  if (entry.tokensGenerated != null) parts.push(`${formatTokens(entry.tokensGenerated)} tok`);
  if (parts.length === 0) return null;
  return <div className="workflow-activity-row__telemetry">{parts.join('  \u00b7  ')}</div>;
};

const TaskActivityRow: React.FC<{ entry: ActivityViewEntry }> = ({ entry }) => {
  const label = STATUS_LABELS[entry.status] ?? 'pending';
  const elapsed = entry.elapsedMs != null ? formatDuration(entry.elapsedMs) : null;

  return (
    <div className={`workflow-activity-row workflow-activity-row--${entry.status}`}>
      <div className="workflow-activity-row__main">
        <span className="workflow-activity-row__status">{label}</span>
        <span className="workflow-activity-row__desc">{entry.description}</span>
        {elapsed && <span className="workflow-activity-row__elapsed">{elapsed}</span>}
      </div>
      {entry.status === 'running' && <TelemetryLine entry={entry} />}
      {entry.status === 'completed' && <TelemetryLine entry={entry} />}
      {entry.status === 'failed' && entry.error && (
        <div className="workflow-activity-row__telemetry workflow-activity-row__telemetry--error">
          {entry.error}
        </div>
      )}
    </div>
  );
};

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
  const {
    progress,
    hasResponse,
    responseText,
    modelLabel,
    statusText,
    activityEntries,
    isSynthesizing,
  } = useWorkflowView(props);

  const showActivityLog = activityEntries.length > 0 || (state === 'active' && taskCount === 0);
  const placeholderText = taskCount > 0 && activityEntries.length === 0
    ? 'Loading task details...'
    : 'Decomposing prompt into tasks...';

  return (
    <div className={`workflow-view workflow-view--${state}`}>
      <div className="workflow-view__header">
        <span className="workflow-view__id">{workflowId.slice(0, 8)}</span>
        <span className="workflow-view__state">{statusText}</span>
      </div>
      <div className="workflow-view__prompt">
        <KeywordText text={prompt} variant="workflow" />
      </div>
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
      {showActivityLog && (
        <div className="workflow-view__activity-log">
          {activityEntries.length > 0 ? (
            activityEntries.map((entry) => (
              <TaskActivityRow key={entry.taskId} entry={entry} />
            ))
          ) : (
            <div className="workflow-view__phase">{placeholderText}</div>
          )}
          {isSynthesizing && (
            <div className="workflow-view__phase workflow-view__phase--synthesizing">
              Synthesizing results...
            </div>
          )}
        </div>
      )}
      {modelLabel && <div className="workflow-view__meta">Model: {modelLabel}</div>}
      {hasResponse && (
        <div className="workflow-view__response">
          <MarkdownRenderer text={responseText ?? ''} />
        </div>
      )}
      {!hasResponse && state === 'active' && !showActivityLog && (
        <div className="workflow-view__placeholder">Waiting for response fragments...</div>
      )}
      {error && <div className="workflow-view__error">{error}</div>}
    </div>
  );
};
