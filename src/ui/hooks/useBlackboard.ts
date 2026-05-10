import { useCallback, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { getNodes, getActiveWorkflows, getPromptRequests, getTelemetry } from '@core/blackboard/root-doc';
import { useBlackboardContext } from '@ui/context/BlackboardContext';
import { createLogger } from '@utils/logging';

const log = createLogger('use-blackboard');

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false;
  }
  return true;
}

function shallowEqualMaps(a: Map<string, unknown>, b: Map<string, unknown>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, valueA] of a) {
    if (!b.has(key)) return false;
    if (!shallowEqual(valueA, b.get(key))) return false;
  }
  return true;
}

interface UseBlackboardReturn {
  doc: Y.Doc | null;
  nodes: Map<string, unknown>;
  workflows: Map<string, unknown>;
  promptRequests: Map<string, unknown>;
  telemetry: Map<string, unknown>;
  observe: (path: string) => void;
}

export function useBlackboard(): UseBlackboardReturn {
  const { doc } = useBlackboardContext();

  const [nodes, setNodes] = useState<Map<string, unknown>>(new Map());
  const [workflows, setWorkflows] = useState<Map<string, unknown>>(new Map());
  const [promptRequests, setPromptRequests] = useState<Map<string, unknown>>(new Map());
  const [telemetry, setTelemetry] = useState<Map<string, unknown>>(new Map());

  useEffect(() => {
    if (!doc) return;

    const nodesMap = getNodes(doc);
    const refreshNodes = () => {
      const nMap = getNodes(doc);
      if (!nMap) return;
      const data = new Map<string, unknown>();
      for (const [key] of nMap) {
        data.set(key, nMap.get(key)?.toJSON());
      }
      setNodes((prev) => (shallowEqualMaps(prev, data) ? prev : data));
    };
    if (nodesMap) {
      nodesMap.observe(refreshNodes);
    }
    refreshNodes();

    const workflowsMap = getActiveWorkflows(doc);
    const refreshWorkflows = () => {
      const wfMap = getActiveWorkflows(doc);
      if (!wfMap) return;
      const data = new Map<string, unknown>();
      let count = 0;
      for (const [key] of wfMap) {
        data.set(key, wfMap.get(key)?.toJSON());
        count++;
      }
      setWorkflows((prev) => {
        if (shallowEqualMaps(prev, data)) return prev;
        if (count > 0) {
          log.info('workflows refresh', { count, viaClosure: !!workflowsMap });
        }
        return data;
      });
    };
    if (workflowsMap) {
      workflowsMap.observe(refreshWorkflows);
    }
    refreshWorkflows();

    const promptRequestsMap = getPromptRequests(doc);
    const refreshPromptRequests = () => {
      const requestsMap = getPromptRequests(doc);
      if (!requestsMap) return;
      const data = new Map<string, unknown>();
      for (const [key] of requestsMap) {
        data.set(key, requestsMap.get(key)?.toJSON());
      }
      setPromptRequests((prev) => (shallowEqualMaps(prev, data) ? prev : data));
    };
    if (promptRequestsMap) {
      promptRequestsMap.observe(refreshPromptRequests);
    }
    refreshPromptRequests();

    const telemetryMap = getTelemetry(doc);
    const refreshTelemetry = () => {
      const tMap = getTelemetry(doc);
      if (!tMap) return;
      const data = new Map<string, unknown>();
      for (const [key] of tMap) {
        data.set(key, tMap.get(key)?.toJSON());
      }
      setTelemetry((prev) => (shallowEqualMaps(prev, data) ? prev : data));
    };
    if (telemetryMap) {
      telemetryMap.observe(refreshTelemetry);
    }
    refreshTelemetry();

    // Polling fallback: Y.applyUpdate (remote sync) may not fire
    // Y.Map observers reliably on deeply nested maps.
    // The BlackboardDebugger reads directly from the doc;
    // this keeps the UI reactive state in sync with the same data.
    const interval = setInterval(() => {
      refreshNodes();
      refreshWorkflows();
      refreshPromptRequests();
      refreshTelemetry();
    }, 2000);

    return () => {
      if (nodesMap) {
        nodesMap.unobserve(refreshNodes);
      }
      if (workflowsMap) {
        workflowsMap.unobserve(refreshWorkflows);
      }
      if (promptRequestsMap) {
        promptRequestsMap.unobserve(refreshPromptRequests);
      }
      if (telemetryMap) {
        telemetryMap.unobserve(refreshTelemetry);
      }
      clearInterval(interval);
    };
  }, [doc]);

  const observe = useCallback((_path: string) => {
    // Path-based observation would be set up here
  }, [doc]);

  return { doc, nodes, workflows, promptRequests, telemetry, observe };
}
