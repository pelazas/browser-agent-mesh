import { describe, it, expect } from 'vitest';

function buildPopoverData(nodes: { id: string; role: string; status: string; gpu?: string; tasks?: number; models: string[] }[]) {
  const grouped = new Map<string, { id: string; role: string; status: string; gpu: string | null; tasks: number | null; models: string[]; shortId: string }[]>();
  for (const n of nodes) {
    const row = {
      id: n.id,
      role: n.role,
      status: n.status,
      gpu: n.gpu ?? null,
      tasks: n.tasks ?? null,
      models: n.models,
      shortId: n.id.slice(0, 8),
    };
    const list = grouped.get(n.role) ?? [];
    list.push(row);
    grouped.set(n.role, list);
  }

  const nodesWithGPU = nodes.filter((n) => n.gpu).length;

  const modelsSet = new Set<string>();
  for (const n of nodes) {
    for (const m of n.models) modelsSet.add(m);
  }

  return { grouped, total: nodes.length, nodesWithGPU, uniqueModels: Array.from(modelsSet) };
}

describe('buildPopoverData', () => {
  it('returns empty maps for no nodes', () => {
    const result = buildPopoverData([]);
    expect(result.total).toBe(0);
    expect(result.nodesWithGPU).toBe(0);
    expect(result.uniqueModels).toEqual([]);
    expect(result.grouped.size).toBe(0);
  });

  it('groups nodes by role', () => {
    const nodes = [
      { id: 'worker-aabbccdd', role: 'worker', status: 'busy', gpu: '4096MB', models: ['Llama-3.2-1B'] },
      { id: 'worker-eeffgghh', role: 'worker', status: 'busy', gpu: '2048MB', models: ['SmolLM-135M'] },
      { id: 'sentinel-iijjkkll', role: 'sentinel', status: 'idle', models: [] },
    ];
    const result = buildPopoverData(nodes);

    expect(result.total).toBe(3);
    expect(result.grouped.size).toBe(2);
    expect(result.grouped.get('worker')).toHaveLength(2);
    expect(result.grouped.get('sentinel')).toHaveLength(1);
  });

  it('counts nodes with GPU', () => {
    const nodes = [
      { id: 'node-1', role: 'worker', status: 'busy', gpu: '4096MB', models: [] },
      { id: 'node-2', role: 'worker', status: 'idle', models: [] },
      { id: 'node-3', role: 'bridge', status: 'idle', models: [] },
    ];
    const result = buildPopoverData(nodes);
    expect(result.nodesWithGPU).toBe(1);
  });

  it('deduplicates model IDs across nodes', () => {
    const nodes = [
      { id: 'node-1', role: 'worker', status: 'busy', gpu: '4096MB', models: ['Llama-3.2-1B', 'SmolLM-135M'] },
      { id: 'node-2', role: 'worker', status: 'busy', gpu: '4096MB', models: ['Llama-3.2-1B'] },
    ];
    const result = buildPopoverData(nodes);
    expect(result.uniqueModels).toEqual(expect.arrayContaining(['Llama-3.2-1B', 'SmolLM-135M']));
    expect(result.uniqueModels).toHaveLength(2);
  });

  it('truncates node IDs to 8 chars in shortId', () => {
    const nodes = [
      { id: 'abcdefgh-longer-suffix', role: 'ui', status: 'idle', models: [] },
    ];
    const result = buildPopoverData(nodes);
    expect(result.grouped.get('ui')![0].shortId).toBe('abcdefgh');
    expect(result.grouped.get('ui')![0].shortId).toHaveLength(8);
  });

  it('handles null gpu and tasks gracefully', () => {
    const nodes = [
      { id: 'node-1', role: 'sentinel', status: 'idle', models: [] },
    ];
    const result = buildPopoverData(nodes);
    const row = result.grouped.get('sentinel')![0];
    expect(row.gpu).toBeNull();
    expect(row.tasks).toBeNull();
  });
});
