import { describe, it, expect } from 'vitest';
import { DAG } from '@core/graph/dag';

describe('DAG', () => {
  it('creates a single node DAG', () => {
    const dag = new DAG();
    const id = dag.addNode({
      type: 'llm_inference',
      description: 'test task',
      args: {},
    });

    expect(dag.hasNode(id)).toBe(true);
    expect(dag.getReadyTasks()).toHaveLength(1);
  });

  it('detects readiness based on completed predecessors', () => {
    const dag = new DAG();
    const rootId = dag.addNode({
      type: 'retrieve',
      description: 'fetch data',
      args: {},
    });

    const childId = dag.addNode({
      type: 'llm_inference',
      description: 'process data',
      args: {},
    });

    dag.addEdge(rootId, childId);

    expect(dag.getReadyTasks()).toHaveLength(1);

    const rootNode = dag.getNode(rootId)!;
    rootNode.status = 'completed';

    expect(dag.getReadyTasks()).toHaveLength(1);
    expect(dag.getReadyTasks()[0].id).toBe(childId);
  });

  it('generates topological order', () => {
    const dag = new DAG();
    const a = dag.addNode({ type: 'retrieve', description: 'A', args: {} });
    const b = dag.addNode({ type: 'llm_inference', description: 'B', args: {} });
    const c = dag.addNode({ type: 'reduce', description: 'C', args: {} });

    dag.addEdge(a, b);
    dag.addEdge(b, c);

    const order = dag.topologicalOrder();
    expect(order).toEqual([a, b, c]);
  });

  it('detects parallel groups', () => {
    const dag = new DAG();
    const root = dag.addNode({ type: 'retrieve', description: 'root', args: {} });
    const branch1 = dag.addNode({ type: 'llm_inference', description: 'b1', args: {} });
    const branch2 = dag.addNode({ type: 'llm_inference', description: 'b2', args: {} });

    dag.addEdge(root, branch1, 'parallel');
    dag.addEdge(root, branch2, 'parallel');

    const groups = dag.getParallelGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it('detects completion', () => {
    const dag = new DAG();
    const id = dag.addNode({ type: 'llm_inference', description: 'task', args: {} });
    const node = dag.getNode(id)!;

    expect(dag.isComplete()).toBe(false);
    node.status = 'completed';
    expect(dag.isComplete()).toBe(true);
  });
});
