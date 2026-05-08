import React from 'react';

interface AgentCardProps {
  nodeId: string;
  role: string;
  status: string;
  gpu?: {
    vramEstimateMB: number;
    benchmarkScore: number;
    compatibleModels: string[];
  };
  taskCount?: number;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  nodeId,
  role,
  status,
  gpu,
  taskCount,
}) => {
  const statusClass = `agent-card--${status}`;

  return (
    <div className={`agent-card ${statusClass}`}>
      <div className="agent-card__header">
        <span className="agent-card__role">{role}</span>
        <span className="agent-card__status">{status}</span>
      </div>
      <div className="agent-card__id">{nodeId.slice(0, 12)}...</div>
      {gpu && (
        <div className="agent-card__gpu">
          <span>VRAM: {gpu.vramEstimateMB}MB</span>
          <span>Score: {gpu.benchmarkScore}</span>
          <span>Models: {gpu.compatibleModels.length}</span>
        </div>
      )}
      {taskCount !== undefined && (
        <div className="agent-card__tasks">{taskCount} active</div>
      )}
    </div>
  );
};
