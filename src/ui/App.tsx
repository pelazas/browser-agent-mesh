import React from 'react';
import { MeshGraph } from '@ui/components/MeshGraph';
import { RichPromptInput } from '@ui/components/RichPromptInput';
import { TelemetryPanel } from '@ui/components/TelemetryPanel';
import { WorkflowView } from '@ui/components/WorkflowView';
import { BlackboardDebugger } from '@ui/components/BlackboardDebugger';
import { PeerPopover } from '@ui/components/PeerPopover';
import HITLDialog from '@ui/components/HITLDialog';
import { usePeerPopover } from '@ui/components/usePeerPopover';
import { useBlackboard } from '@ui/hooks/useBlackboard';
import { useAppView } from '@ui/hooks/useAppView';
import { useNetworkHealth } from '@ui/hooks/useMesh';
import '@ui/styles/main.css';

export const App: React.FC = () => {
  const { nodes, workflows, promptRequests, telemetry } = useBlackboard();
  const networkHealth = useNetworkHealth();
  const { meshNodes, telemetryMetrics, workflowList } = useAppView({
    nodes,
    workflows,
    promptRequests,
    telemetry,
  });
  const popover = usePeerPopover(meshNodes, networkHealth);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Browser Agent Mesh</h1>
        <div
          className="app__status"
          onMouseEnter={popover.open}
          onMouseLeave={popover.close}
        >
          <span
            className={`app__status-dot${networkHealth.connected ? ' app__status-dot--connected' : networkHealth.signalingConnected ? ' app__status-dot--signaling' : ''}`}
          />
          <span>
            {networkHealth.connected
              ? `${networkHealth.peerCount} peer${networkHealth.peerCount !== 1 ? 's' : ''}`
              : networkHealth.signalingConnected
                ? 'signaling OK, waiting for peers...'
                : !networkHealth.rtcAvailable
                  ? 'WebRTC unavailable'
                  : 'disconnected (no signaling)'}
          </span>
          <PeerPopover popover={popover} />
        </div>
      </header>

      <div className="app__grid">
        <div className="app__main">
          <RichPromptInput disabled={false} />

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
      <HITLDialog />
    </div>
  );
};
