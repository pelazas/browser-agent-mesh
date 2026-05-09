import * as Y from 'yjs';
import { BaseAgent } from '../base';
import { getActiveWorkflows } from '@core/blackboard/root-doc';
import { createLogger } from '@utils/logging';

const log = createLogger('bridge-agent');

export class BridgeAgent extends BaseAgent {
  constructor() {
    super({ role: 'bridge' });
  }

  protected async run(): Promise<void> {
    log.info('bridge running');

    while (this.running) {
      await this.pollForToolCalls();
      await this.sleep(2000);
    }
  }

  private async pollForToolCalls(): Promise<void> {
    const workflows = getActiveWorkflows(this.doc);

    for (const [workflowId] of workflows) {
      const workflow = workflows.get(workflowId);
      if (!workflow) continue;

      const dagMap = workflow.get('dag') as Y.Map<Y.Map<unknown>>;
      if (!dagMap) continue;

      for (const [, nodeEntry] of dagMap) {
        const data = nodeEntry.toJSON() as Record<string, unknown>;
        if (data.type === 'scrape' && data.status === 'claimed') {
          log.info('executing scrape task');
          // Execute scraping logic
        }
      }
    }
  }
}
