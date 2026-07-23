import type { ToolRegistry } from './registry.js';
import type { ToolCallRequest, ToolCallResult } from '../types/index.js';
import { CodelabSageError } from '../utils/errors.js';

export async function executeToolCall(
  registry: ToolRegistry,
  request: ToolCallRequest,
): Promise<ToolCallResult> {
  const tool = registry.get(request.name);
  if (!tool) {
    return {
      toolCallId: request.id,
      content: `Error: Tool "${request.name}" is not available.`,
    };
  }

  try {
    const content = await tool.execute(request.arguments);
    return { toolCallId: request.id, content };
  } catch (err) {
    const message = err instanceof CodelabSageError ? err.message : (err as Error).message;
    return {
      toolCallId: request.id,
      content: `Error executing tool "${request.name}": ${message}`,
    };
  }
}

export async function executeToolCalls(
  registry: ToolRegistry,
  requests: ToolCallRequest[],
): Promise<ToolCallResult[]> {
  return Promise.all(requests.map((req) => executeToolCall(registry, req)));
}
