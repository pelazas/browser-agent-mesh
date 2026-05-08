import React from 'react';

interface MetricsEntry {
  nodeId: string;
  cpuUsage: number;
  vramUsedMB: number;
  tokensPerSec: number | null;
  peerCount: number;
  timestamp: number;
}

interface TelemetryPanelProps {
  metrics: MetricsEntry[];
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ metrics }) => {
  if (metrics.length === 0) {
    return (
      <div className="telemetry-panel">
        <h3>Telemetry</h3>
        <div className="telemetry-panel__empty">No telemetry data yet.</div>
      </div>
    );
  }

  return (
    <div className="telemetry-panel">
      <h3>Telemetry</h3>
      <div className="telemetry-panel__list">
        {metrics.map((m) => (
          <div key={m.nodeId} className="telemetry-entry">
            <div className="telemetry-entry__id">{m.nodeId.slice(0, 8)}</div>
            <div className="telemetry-entry__stats">
              <span>CPU: {m.cpuUsage.toFixed(1)}MB</span>
              <span>VRAM: {m.vramUsedMB}MB</span>
              {m.tokensPerSec !== null && (
                <span>{m.tokensPerSec.toFixed(1)} tok/s</span>
              )}
              <span>Peers: {m.peerCount}</span>
            </div>
            <div className="telemetry-entry__time">
              {new Date(m.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
