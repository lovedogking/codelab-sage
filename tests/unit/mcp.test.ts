import { describe, it, expect } from 'vitest';
import { createMcpTools } from '../../src/mcp/adapter.js';
import type { McpClient } from '../../src/mcp/client.js';
import type { McpToolDefinition } from '../../src/mcp/types.js';

class FakeMcpClient implements Pick<McpClient, 'name' | 'getDefinitions' | 'callTool'> {
  name = 'fake-server';

  getDefinitions(): McpToolDefinition[] {
    return [
      {
        name: 'greet',
        description: 'Say hello',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      },
    ];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (name === 'greet') {
      return `Hello, ${args.name}`;
    }
    return '';
  }
}

describe('MCP adapter', () => {
  it('prefixes tool names with server name', () => {
    const client = new FakeMcpClient();
    const tools = createMcpTools(client as unknown as McpClient);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('fake-server_greet');
    expect(tools[0].parameters.required).toContain('name');
  });

  it('calls the underlying MCP tool', async () => {
    const client = new FakeMcpClient();
    const tools = createMcpTools(client as unknown as McpClient);

    const result = await tools[0].execute({ name: 'Sage' });
    expect(result).toBe('Hello, Sage');
  });
});
