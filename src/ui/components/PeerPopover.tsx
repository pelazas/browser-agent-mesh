import React from 'react';
import { type UsePeerPopoverResult } from '@ui/components/usePeerPopover';

interface PeerPopoverProps {
  popover: UsePeerPopoverResult;
}

const ROLE_ORDER = ['ui', 'worker', 'sentinel', 'bridge', 'synthesizer'];

function shortModel(model: string): string {
  const name = model.split('/').pop() ?? model;
  return name.split('-').slice(0, 2).join('-');
}

export const PeerPopover: React.FC<PeerPopoverProps> = ({ popover }) => {
  if (!popover.isOpen || popover.totalNodes === 0) return null;

  return (
    <div className="peer-popover">
      <div className="peer-popover__summary">
        {popover.totalNodes} node{popover.totalNodes !== 1 ? 's' : ''}
        {popover.nodesWithGPU > 0 && ` \u00b7 ${popover.nodesWithGPU} with WebGPU`}
        {popover.uniqueModels.length > 0 && ` \u00b7 ${popover.uniqueModels.length} model${popover.uniqueModels.length !== 1 ? 's' : ''}`}
      </div>
      <table className="peer-popover__table">
        <thead>
          <tr>
            <th>Role</th>
            <th>ID</th>
            <th>Status</th>
            <th>GPU</th>
            <th>Models</th>
          </tr>
        </thead>
        <tbody>
          {ROLE_ORDER.map((role) => {
            const list = popover.grouped.get(role);
            if (!list || list.length === 0) return null;
            return list.map((node) => (
              <tr key={node.id} className={`peer-popover__row peer-popover__row--${node.status}`}>
                <td className="peer-popover__cell-role">{node.role}</td>
                <td className="peer-popover__cell-id" title={node.id}>{node.shortId}</td>
                <td className="peer-popover__cell-status">{node.status}</td>
                <td className="peer-popover__cell-gpu">{node.gpu ?? '\u2014'}</td>
                <td className="peer-popover__cell-models">
                  {node.models.length > 0
                    ? node.models.map((m) => shortModel(m)).join(', ')
                    : '\u2014'}
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
      {popover.uniqueModels.length > 0 && (
        <div className="peer-popover__models">
          {popover.uniqueModels.map((m) => (
            <span key={m} className="peer-popover__model-badge">{shortModel(m)}</span>
          ))}
        </div>
      )}
    </div>
  );
};
