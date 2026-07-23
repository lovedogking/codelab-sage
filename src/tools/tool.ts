import type { ToolDefinition } from '../types/index.js';

export interface Tool extends ToolDefinition {
  execute(args: Record<string, unknown>): Promise<string>;
}
