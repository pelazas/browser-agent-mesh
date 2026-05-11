import { useMemo } from 'react';

interface MeshNodeUI {
  id: string;
  role: string;
  status: string;
  gpu?: string;
  tasks?: number;
  models: string[];
}

interface MetricsEntryUI {
  nodeId: string;
  cpuUsage: number;
  vramUsedMB: number;
  tokensPerSec: number | null;
  peerCount: number;
  timestamp: number;
}

interface WorkflowFragmentContent {
  type?: string;
  prompt?: string;
  output?: string;
  modelId?: string;
  tokensGenerated?: number;
  tokensPerSec?: number;
}

interface WorkflowFragment {
  taskId?: string;
  content?: WorkflowFragmentContent;
  confidence?: number;
}

interface WorkflowResultUI {
  type?: string;
  content?: string;
  output?: string;
  modelId?: string;
  tokensGenerated?: number;
  tokensPerSec?: number;
  fragments?: WorkflowFragment[];
}

interface WorkflowRecordUI {
  prompt?: string;
  state?: string;
  taskCount?: number;
  completedCount?: number;
  failedCount?: number;
  createdAt?: number;
  updatedAt?: number;
  error?: string | null;
  result?: WorkflowResultUI | null;
}

interface PromptRequestUI {
  prompt?: string;
  status?: string;
  workflowId?: string | null;
  updatedAt?: number;
}

export interface TaskActivityEntry {
  taskId: string;
  description: string;
  type: string;
  status: string;
  claimedBy: string | null;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  modelId: string | null;
  tokensGenerated: number | null;
  tokensPerSec: number | null;
}

export interface WorkflowCardView {
  workflowId: string;
  prompt: string;
  state: string;
  taskCount: number;
  completedCount: number;
  failedCount: number;
  error: string | null;
  modelId: string | null;
  responseText: string | null;
  isProcessing: boolean;
  createdAt: number;
  tasks: TaskActivityEntry[];
}

interface PromptStatusView {
  active: boolean;
  message: string | null;
}

interface UseAppViewArgs {
  nodes: Map<string, unknown>;
  workflows: Map<string, unknown>;
  promptRequests: Map<string, unknown>;
  telemetry: Map<string, unknown>;
}

interface UseAppViewReturn {
  meshNodes: MeshNodeUI[];
  telemetryMetrics: MetricsEntryUI[];
  workflowList: WorkflowCardView[];
  promptStatus: PromptStatusView;
}

export function extractWorkflowResponse(workflow: WorkflowRecordUI): {
  modelId: string | null;
  responseText: string | null;
} {
  const directModelId = typeof workflow.result?.modelId === 'string'
    ? workflow.result.modelId
    : null;
  const directOutput = typeof workflow.result?.output === 'string' && workflow.result.output.trim().length > 0
    ? workflow.result.output
    : null;

  if (directOutput !== null || directModelId !== null) {
    return { modelId: directModelId, responseText: directOutput };
  }

  const fragments = Array.isArray(workflow.result?.fragments) ? workflow.result?.fragments : [];
  const llmFragment = fragments.find((fragment) => fragment.content?.type === 'llm_result');

  const modelId = typeof llmFragment?.content?.modelId === 'string'
    ? llmFragment.content.modelId
    : null;

  const responseText = typeof llmFragment?.content?.output === 'string'
    ? llmFragment.content.output
    : typeof workflow.result?.content === 'string' && workflow.result.content.trim().length > 0
      ? workflow.result.content
      : null;

  return { modelId, responseText };
}

export function extractTaskActivities(workflow: WorkflowRecordUI): TaskActivityEntry[] {
  const dag = (workflow as Record<string, unknown>).dag as Record<string, Record<string, unknown>> | undefined;
  if (!dag) return [];

  return Object.entries(dag).map(([taskId, task]) => {
    const result = task?.result as Record<string, unknown> | undefined;
    const modelId = typeof result?.modelId === 'string' ? result.modelId : null;
    const tokensGenerated = typeof result?.tokensGenerated === 'number' ? result.tokensGenerated : null;
    const tokensPerSec = typeof result?.tokensPerSec === 'number' ? result.tokensPerSec : null;

    return {
      taskId,
      description: typeof task?.description === 'string' ? task.description : '',
      type: typeof task?.type === 'string' ? task.type : 'unknown',
      status: typeof task?.status === 'string' ? task.status : 'pending',
      claimedBy: typeof task?.claimedBy === 'string' ? task.claimedBy : null,
      error: typeof task?.error === 'string' ? task.error : null,
      startedAt: typeof task?.startedAt === 'number' ? task.startedAt : null,
      completedAt: typeof task?.completedAt === 'number' ? task.completedAt : null,
      createdAt: typeof task?.createdAt === 'number' ? task.createdAt : 0,
      modelId,
      tokensGenerated,
      tokensPerSec,
    };
  });
}

export function useAppView({
  nodes,
  workflows,
  promptRequests,
  telemetry,
}: UseAppViewArgs): UseAppViewReturn {
  const meshNodes = useMemo(() => {
    const result: MeshNodeUI[] = [];
    nodes.forEach((val: unknown, key: string) => {
      const data = val as Record<string, unknown>;
      if (!data) return;
      result.push({
        id: key,
        role: (data.role as string) ?? 'unknown',
        status: (data.status as string) ?? 'offline',
        gpu: data.gpu ? `${(data.gpu as Record<string, number>)?.vramEstimateMB}MB` : undefined,
        tasks: Array.isArray(data.tasks) ? (data.tasks as unknown[]).length : undefined,
        models: Array.isArray((data.gpu as Record<string, unknown> | null)?.compatibleModels)
          ? (data.gpu as Record<string, unknown>).compatibleModels as string[]
          : [],
      });
    });
    return result;
  }, [nodes]);

  const telemetryMetrics = useMemo(() => {
    const result: MetricsEntryUI[] = [];
    telemetry.forEach((val: unknown, key: string) => {
      const data = val as Record<string, unknown>;
      if (!data) return;
      result.push({
        nodeId: key,
        cpuUsage: (data.cpuUsage as number) ?? 0,
        vramUsedMB: (data.vramUsedMB as number) ?? 0,
        tokensPerSec: (data.tokensPerSec as number | null) ?? null,
        peerCount: (data.peerCount as number) ?? 0,
        timestamp: (data.timestamp as number) ?? Date.now(),
      });
    });
    return result;
  }, [telemetry]);

  const workflowList = useMemo(() => {
    const result: WorkflowCardView[] = [];
    workflows.forEach((val: unknown, key: string) => {
      const data = val as WorkflowRecordUI;
      if (!data) return;
      const { modelId, responseText } = extractWorkflowResponse(data);
      result.push({
        workflowId: key,
        prompt: data.prompt ?? '',
        state: data.state ?? 'active',
        taskCount: data.taskCount ?? 0,
        completedCount: data.completedCount ?? 0,
        failedCount: data.failedCount ?? 0,
        error: typeof data.error === 'string' ? data.error : null,
        modelId,
        responseText,
        isProcessing: data.state === 'active',
        createdAt: data.createdAt ?? 0,
        tasks: extractTaskActivities(data),
      });
    });

    return result.sort((a, b) => b.createdAt - a.createdAt);
  }, [workflows]);

  const promptStatus = useMemo(() => {
    const activeRequests = Array.from(promptRequests.values())
      .map((value) => value as PromptRequestUI)
      .filter((request) => request.status === 'pending' || request.status === 'claimed')
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

    if (activeRequests.length > 0) {
      const request = activeRequests[0];
      return {
        active: true,
        message: request.status === 'claimed'
          ? `Routing prompt: ${request.prompt ?? 'in progress'}`
          : `Queued prompt: ${request.prompt ?? 'in progress'}`,
      };
    }

    const activeWorkflow = workflowList.find((workflow) => workflow.isProcessing);
    if (activeWorkflow) {
      return {
        active: true,
        message: `Processing response: ${activeWorkflow.prompt}`,
      };
    }

    return { active: false, message: null };
  }, [promptRequests, workflowList]);

  return { meshNodes, telemetryMetrics, workflowList, promptStatus };
}
