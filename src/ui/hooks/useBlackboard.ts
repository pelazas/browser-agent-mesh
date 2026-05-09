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

    return () => {
      // Observers auto-cleanup when Y.Map is GC'd
    };
  }, [doc]);

  const observe = useCallback((_path: string) => {
    // Path-based observation would be set up here
  }, [doc]);

  return { doc, nodes, workflows, telemetry, observe };
}
