import React from 'react';

interface MeshNode {
  id: string;
  gpu?: string;
  selectedModel: string | null;
  agentCount: number;
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
          <div key={node.id} className="mesh-node">
            <div className="mesh-node__role">tab</div>
            <div className="mesh-node__id">{node.id.slice(0, 8)}</div>
            {node.gpu && <div className="mesh-node__gpu">{node.gpu}</div>}
            {node.selectedModel && <div className="mesh-node__tasks">{node.selectedModel}</div>}
          </div>
        ))}
        {nodes.length === 0 && (
          <div className="mesh-graph__empty">No nodes connected. Waiting for peers...</div>
        )}
      </div>
    </div>
  );
};
