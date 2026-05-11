import * as Y from 'yjs';
import { createLogger } from '@utils/logging';
import { WorkerSyncProvider } from '@core/blackboard/worker-provider';
import { generateId } from '@utils/id';
import { createRootDoc, registerNode, updateNodeMetadata } from '@core/blackboard/root-doc';

export interface AgentConfig {
  role: string;
  nodeId?: string;
  doc?: Y.Doc;
  tabId?: string;
  gpu?: unknown | null;
}

export abstract class BaseAgent {
  protected doc: Y.Doc;
  protected provider: WorkerSyncProvider | null = null;
  protected nodeId: string;
  protected tabId: string;
  protected role: string;
  protected log: ReturnType<typeof createLogger>;
  protected running = false;
  protected gpu: unknown | null;

  constructor(config: AgentConfig) {
    this.nodeId = config.nodeId ?? generateId();
    this.tabId = config.tabId ?? generateId();
    this.role = config.role;
    this.doc = config.doc ?? createRootDoc();
    this.gpu = config.gpu ?? null;
    this.log = createLogger(`${config.role}-agent:${this.nodeId.slice(0, 8)}`);
  }

  connect(port: MessagePort): void {
    registerNode(this.doc, this.nodeId, this.role, this.gpu, this.tabId);
    this.provider = new WorkerSyncProvider(this.doc, port);
    this.provider.connect(this.nodeId, this.role);
    this.log.info('connected to mesh');
  }

  protected syncNodeMetadata(fields: Record<string, unknown>): void {
    updateNodeMetadata(this.doc, this.nodeId, fields);
  }

  protected publishTool(name: string, description: string, schema: Record<string, unknown>): void {
    this.provider?.publishTool(name, description, schema);
  }

  async start(): Promise<void> {
    this.running = true;
    this.log.info('agent started');
    await this.run();
  }

  stop(): void {
    this.running = false;
    this.log.info('agent stopped');
    this.provider?.destroy();
  }

  protected abstract run(): Promise<void>;

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
