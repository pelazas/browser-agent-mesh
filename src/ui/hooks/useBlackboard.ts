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
      const data = new Map<string, unknown>();
      for (const [key] of nodesMap) {
        data.set(key, nodesMap.get(key)?.toJSON());
      }
      setNodes(data);
    };
    nodesMap.observe(refreshNodes);
    refreshNodes();

    const workflowsMap = getActiveWorkflows(doc);
    const refreshWorkflows = () => {
      const data = new Map<string, unknown>();
      let count = 0;
      for (const [key] of workflowsMap) {
        data.set(key, workflowsMap.get(key)?.toJSON());
        count++;
      }
      if (count > 0) {
        log.info('workflows observer fired', { count });
      }
      setWorkflows(data);
    };
    workflowsMap.observe(refreshWorkflows);
    refreshWorkflows();

    const telemetryMap = getTelemetry(doc);
    const refreshTelemetry = () => {
      const data = new Map<string, unknown>();
      for (const [key] of telemetryMap) {
        data.set(key, telemetryMap.get(key)?.toJSON());
      }
      setTelemetry(data);
    };
    telemetryMap.observe(refreshTelemetry);
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
