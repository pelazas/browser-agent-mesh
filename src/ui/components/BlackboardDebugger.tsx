import React, { useEffect, useRef, useState } from 'react';
import { useBlackboardContext } from '@ui/context/BlackboardContext';

interface TreeNode {
  key: string;
  value: unknown;
  type: 'map' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'object';
  collapsed: boolean;
  children: TreeNode[];
}

function classify(value: unknown): TreeNode['type'] {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'null';
}

function buildTree(value: unknown, collapsed: boolean = true): { children: TreeNode[] } {
  if (value === null || value === undefined) return { children: [] };

  if (Array.isArray(value)) {
    const children = value.map((v, i) => makeNode(String(i), v, collapsed));
    return { children };
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    const children = entries
      .filter(([k]) => !k.startsWith('__'))
      .map(([k, v]) => makeNode(k, v, collapsed));
    return { children };
  }

  return { children: [] };
}

function makeNode(key: string, value: unknown, collapsed: boolean = true): TreeNode {
  const t = classify(value);
  const { children } = (t === 'object' || t === 'array')
    ? buildTree(value, collapsed)
    : { children: [] };

  return { key, value, type: t, collapsed, children };
}

function TreeNodeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [collapsed, setCollapsed] = useState(depth >= 2);

  const hasChildren = node.children.length > 0;
  const indent = depth * 16;

  const color = {
    string: '#22c55e',
    number: '#f59e0b',
    boolean: '#818cf8',
    null: '#6b7280',
    object: '#e4e4ec',
    array: '#e4e4ec',
    map: '#e4e4ec',
  }[node.type];

  const displayValue = () => {
    if (node.type === 'null') return 'null';
    if (node.type === 'string') return `"${String(node.value).slice(0, 100)}"`;
    if (node.type === 'object') return hasChildren ? `{${node.children.length} keys}` : '{}';
    if (node.type === 'array') return hasChildren ? `[${node.children.length} items]` : '[]';
    return String(node.value);
  };

  return (
    <>
      <div
        className="debugger-row"
        style={{ paddingLeft: indent }}
        onClick={() => hasChildren && setCollapsed(!collapsed)}
      >
        {hasChildren && (
          <span className="debugger-toggle">{collapsed ? '▸' : '▾'}</span>
        )}
        {!hasChildren && <span className="debugger-toggle debugger-toggle--empty" />}
        <span className="debugger-key">{node.key}</span>
        <span className="debugger-colon">: </span>
        <span className="debugger-value" style={{ color }}>
          {displayValue()}
        </span>
        {node.type === 'string' && (node.value as string).length > 100 && (
          <span className="debugger-truncated">…</span>
        )}
      </div>
      {hasChildren && !collapsed && node.children.map((child) => (
        <TreeNodeRow key={child.key} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export const BlackboardDebugger: React.FC = () => {
  const { doc } = useBlackboardContext();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [visible, setVisible] = useState(false);
  const prevJson = useRef('');

  useEffect(() => {
    if (!doc || !visible) return;

    const rootMap = doc.getMap('bam-blackboard');

    const refresh = () => {
      const raw = rootMap.toJSON() as Record<string, unknown>;
      const json = JSON.stringify(raw);
      if (json === prevJson.current) return;
      prevJson.current = json;

      const children = Object.entries(raw).map(([k, v]) => makeNode(k, v, false));
      setTree(children);
    };

    rootMap.observeDeep(refresh);
    refresh();

    return () => { rootMap.unobserveDeep(refresh); };
  }, [doc, visible]);

  return (
    <div className="debugger">
      <button
        className="debugger-toggle-btn"
        onClick={() => setVisible(!visible)}
      >
        {visible ? '▾' : '▸'} Blackboard
      </button>

      {visible && (
        <div className="debugger-tree">
          {tree.length === 0 && (
            <div className="debugger-empty">
              Blackboard empty
            </div>
          )}
          {tree.map((node) => (
            <TreeNodeRow key={node.key} node={node} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
};
