import type { Tool } from '../tools/tool.js';
import type { McpClient } from './client.js';

export function createMcpTools(client: McpClient): Tool[] {
  const prefix = `${client.name}_`;

  return client.getDefinitions().map((def) => {
    const schema = def.inputSchema ?? { type: 'object', properties: {} };
    return {
      name: `${prefix}${def.name}`,
      description: `MCP tool from "${client.name}": ${def.description ?? def.name}`,
      parameters: {
        type: schema.type ?? 'object',
        properties: schema.properties ?? {},
        required: schema.required ?? [],
      },
      async execute(args) {
        // Strip the client prefix before calling the underlying tool.
        return client.callTool(def.name, args);
      },
    };
  });
}
