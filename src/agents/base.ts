import * as Y from 'yjs';
import { createLogger } from '@utils/logging';
import { WorkerSyncProvider } from '@core/blackboard/worker-provider';
import { generateId } from '@utils/id';

export interface AgentConfig {
  role: string;
  nodeId?: string;
  doc?: Y.Doc;
}

export abstract class BaseAgent {
  protected doc: Y.Doc;
  protected provider: WorkerSyncProvider | null = null;
  protected nodeId: string;
  protected role: string;
  protected log: ReturnType<typeof createLogger>;
  protected running = false;

  constructor(config: AgentConfig) {
    this.nodeId = config.nodeId ?? generateId();
    this.role = config.role;
    this.doc = config.doc ?? new Y.Doc();
    this.log = createLogger(`${config.role}-agent:${this.nodeId.slice(0, 8)}`);
  }

  connect(port: MessagePort): void {
    this.provider = new WorkerSyncProvider(this.doc, port);
    this.provider.connect(this.nodeId, this.role);
    this.log.info('connected to mesh');
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
