import { describe, it, expect } from 'vitest';
import { DAGValidator } from '@core/graph/validator';
import type { Edge, ConditionContext } from '@core/graph/types';

describe('DAGValidator', () => {
  const validator = new DAGValidator();

  it('passes edges with no condition', () => {
    const edge: Edge = {
      id: 'e1',
      source: 'a',
      target: 'b',
      type: 'sequential',
    };
    const ctx: ConditionContext = { nodeResults: new Map(), workflowState: {} };
    expect(validator.validate(edge, ctx)).toBe(true);
  });

  it('evaluates eq condition', () => {
    const edge: Edge = {
      id: 'e1',
      source: 'a',
      target: 'b',
      type: 'conditional',
      condition: { field: 'status', op: 'eq', value: 'done' },
    };
    const ctx: ConditionContext = {
      nodeResults: new Map(),
      workflowState: { status: 'done' },
    };
    expect(validator.validate(edge, ctx)).toBe(true);
  });

  it('rejects unmet condition', () => {
    const edge: Edge = {
      id: 'e1',
      source: 'a',
      target: 'b',
      type: 'conditional',
      condition: { field: 'status', op: 'eq', value: 'done' },
    };
    const ctx: ConditionContext = {
      nodeResults: new Map(),
      workflowState: { status: 'pending' },
    };
    expect(validator.validate(edge, ctx)).toBe(false);
  });

  it('resolves dot-notation fields', () => {
    const edge: Edge = {
      id: 'e1',
      source: 'a',
      target: 'b',
      type: 'conditional',
      condition: { field: 'meta.confidence', op: 'gt', value: 0.5 },
    };
    const ctx: ConditionContext = {
      nodeResults: new Map(),
      workflowState: { meta: { confidence: 0.8 } },
    };
    expect(validator.validate(edge, ctx)).toBe(true);
  });
});
