import { useCallback, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { getNodes, getActiveWorkflows, getTelemetry } from '@core/blackboard/root-doc';
import { useBlackboardContext } from '@ui/context/BlackboardContext';
import { createLogger } from '@utils/logging';

const log = createLogger('use-blackboard');

interface UseBlackboardReturn {
  doc: Y.Doc | null;
  nodes: Map<string, unknown>;
  workflows: Map<string, unknown>;
  telemetry: Map<string, unknown>;
  observe: (path: string) => void;
}

export function useBlackboard(): UseBlackboardReturn {
  const { doc } = useBlackboardContext();

  const [nodes, setNodes] = useState<Map<string, unknown>>(new Map());
  const [workflows, setWorkflows] = useState<Map<string, unknown>>(new Map());
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
      setNodes(data);
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
      if (count > 0) {
        log.info('workflows refresh', { count, viaClosure: !!workflowsMap });
      }
      setWorkflows(data);
    };
    if (workflowsMap) {
      workflowsMap.observe(refreshWorkflows);
    }
    refreshWorkflows();

    const telemetryMap = getTelemetry(doc);
    const refreshTelemetry = () => {
      const tMap = getTelemetry(doc);
      if (!tMap) return;
      const data = new Map<string, unknown>();
      for (const [key] of tMap) {
        data.set(key, tMap.get(key)?.toJSON());
      }
      setTelemetry(data);
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
      refreshTelemetry();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [doc]);

  const observe = useCallback((_path: string) => {
    // Path-based observation would be set up here
  }, [doc]);

  return { doc, nodes, workflows, telemetry, observe };
}
