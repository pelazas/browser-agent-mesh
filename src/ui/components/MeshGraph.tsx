import React, { useCallback, useEffect, useState } from 'react';

interface MeshNode {
  id: string;
  role: string;
  status: string;
  gpu?: string;
  tasks?: number;
}

interface MeshGraphProps {
  nodes: MeshNode[];
}

export const MeshGraph: React.FC<MeshGraphProps> = ({ nodes }) => {
  return (
    <div className="mesh-graph">
      <h3>Mesh Topology</h3>
      <div className="mesh-graph__grid">
        {nodes.map((node) => (
          <div key={node.id} className={`mesh-node mesh-node--${node.status}`}>
            <div className="mesh-node__role">{node.role}</div>
            <div className="mesh-node__id">{node.id.slice(0, 8)}</div>
            <div className="mesh-node__status">{node.status}</div>
            {node.gpu && <div className="mesh-node__gpu">{node.gpu}</div>}
            {node.tasks !== undefined && (
              <div className="mesh-node__tasks">{node.tasks} tasks</div>
            )}
          </div>
        ))}
        {nodes.length === 0 && (
          <div className="mesh-graph__empty">No nodes connected. Waiting for peers...</div>
        )}
      </div>
    </div>
  );
};
