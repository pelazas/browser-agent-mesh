import React from 'react';
import { type UsePeerPopoverResult } from '@ui/components/usePeerPopover';

interface PeerPopoverProps {
  popover: UsePeerPopoverResult;
}

function shortModel(model: string): string {
  const name = model.split('/').pop() ?? model;
  return name.split('-').slice(0, 2).join('-');
}

export const PeerPopover: React.FC<PeerPopoverProps> = ({ popover }) => {
  if (!popover.isOpen || popover.totalNodes === 0) return null;

  return (
    <div className="peer-popover">
      <div className="peer-popover__summary">
        {popover.totalNodes} tab{popover.totalNodes !== 1 ? 's' : ''}
      </div>
      <table className="peer-popover__table">
        <thead>
          <tr>
            <th>Tab</th>
            <th>GPU</th>
            <th>Model</th>
          </tr>
        </thead>
        <tbody>
          {popover.rows.map((node) => (
            <tr key={node.id} className="peer-popover__row">
              <td className="peer-popover__cell-id" title={node.id}>{node.shortId}</td>
              <td className="peer-popover__cell-gpu">{node.gpu ?? '\u2014'}</td>
              <td className="peer-popover__cell-models">{node.selectedModel ? shortModel(node.selectedModel) : '\u2014'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
