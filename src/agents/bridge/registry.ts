import type { ToolDescriptor } from '@core/blackboard/schema';
import { createLogger } from '@utils/logging';

const log = createLogger('tool-registry');

export class ToolRegistry {
  private tools: Map<string, ToolDescriptor> = new Map();

  register(descriptor: ToolDescriptor): void {
    this.tools.set(descriptor.id, descriptor);
    log.info('tool registered', { id: descriptor.id, name: descriptor.name });
  }

  unregister(toolId: string): void {
    this.tools.delete(toolId);
  }

  list(): ToolDescriptor[] {
    return Array.from(this.tools.values());
  }

  get(toolId: string): ToolDescriptor | undefined {
    return this.tools.get(toolId);
  }

  getByNode(nodeId: string): ToolDescriptor[] {
    return this.list().filter((t) => t.ownerNodeId === nodeId);
  }
}
