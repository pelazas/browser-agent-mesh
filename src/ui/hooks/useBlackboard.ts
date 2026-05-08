import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { createRootDoc, getNodes, getActiveWorkflows, getTelemetry } from '@core/blackboard/root-doc';

interface UseBlackboardReturn {
  doc: Y.Doc;
  nodes: Map<string, unknown>;
  workflows: Map<string, unknown>;
  telemetry: Map<string, unknown>;
  observe: (path: string) => void;
}

let sharedDoc: Y.Doc | null = null;

export function useBlackboard(): UseBlackboardReturn {
  const [doc] = useState(() => {
    if (!sharedDoc) {
      sharedDoc = createRootDoc();
    }
    return sharedDoc;
  });

  const [nodes, setNodes] = useState<Map<string, unknown>>(new Map());
  const [workflows, setWorkflows] = useState<Map<string, unknown>>(new Map());
  const [telemetry, setTelemetry] = useState<Map<string, unknown>>(new Map());

  useEffect(() => {
    const nodesMap = getNodes(doc);
    nodesMap.observe(() => {
      const data = new Map<string, unknown>();
      for (const [key] of nodesMap) {
        data.set(key, nodesMap.get(key)?.toJSON());
      }
      setNodes(data);
    });

    const workflowsMap = getActiveWorkflows(doc);
    workflowsMap.observe(() => {
      const data = new Map<string, unknown>();
      for (const [key] of workflowsMap) {
        data.set(key, workflowsMap.get(key)?.toJSON());
      }
      setWorkflows(data);
    });

    const telemetryMap = getTelemetry(doc);
    telemetryMap.observe(() => {
      const data = new Map<string, unknown>();
      for (const [key] of telemetryMap) {
        data.set(key, telemetryMap.get(key)?.toJSON());
      }
      setTelemetry(data);
    });

    return () => {
      // Cleanup observers
    };
  }, [doc]);

  const observe = useCallback(
    (_path: string) => {
      // Path-based observation would be set up here
    },
    [doc],
  );

  return { doc, nodes, workflows, telemetry, observe };
}
