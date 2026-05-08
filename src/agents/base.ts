import * as Y from 'yjs';
import { createLogger } from '@utils/logging';
import { WorkerSyncProvider } from '@core/blackboard/worker-provider';
import { generateId } from '@utils/id';

export interface AgentConfig {
  role: string;
  nodeId?: string;
}

export abstract class BaseAgent {
  protected doc: Y.Doc;
  protected provider: WorkerSyncProvider;
  protected nodeId: string;
  protected role: string;
  protected log: ReturnType<typeof createLogger>;
  protected running = false;

  constructor(config: AgentConfig) {
    this.nodeId = config.nodeId ?? generateId();
    this.role = config.role;
    this.doc = new Y.Doc();
    this.provider = new WorkerSyncProvider(this.doc, null as unknown as MessagePort);
    this.log = createLogger(`${config.role}-agent:${this.nodeId.slice(0, 8)}`);
  }

  connect(port: MessagePort): void {
    (this.provider as unknown as { port: MessagePort }).port = port;
    this.provider.connect(this.nodeId, this.role);
    this.log.info('connected to mesh');
  }

  async start(): Promise<void> {
    this.running = true;
    this.log.info('agent started');
    await this.run();
  }

  stop(): void {
    this.running = false;
    this.log.info('agent stopped');
    this.provider.destroy();
  }

  protected abstract run(): Promise<void>;

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
