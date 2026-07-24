import type { SageConfig } from '../config/schema.js';
import type { ToolRegistry } from '../tools/registry.js';
import { McpClient } from './client.js';
import { createMcpTools } from './adapter.js';

export interface McpLoaderResult {
  clients: McpClient[];
}

export async function loadMcpServers(
  config: SageConfig,
  registry: ToolRegistry,
): Promise<McpLoaderResult> {
  const servers = config.mcpServers ?? [];
  const clients: McpClient[] = [];

  for (const server of servers) {
    try {
      const client = new McpClient({ server });
      await client.connect();
      const tools = createMcpTools(client);
      registry.registerAll(tools);
      clients.push(client);
    } catch (err) {
      // Log but do not fail startup if one MCP server is misconfigured.
      console.error(`Failed to load MCP server "${server.name}": ${(err as Error).message}`);
    }
  }

  return { clients };
}

export function disconnectMcpClients(clients: McpClient[]): void {
  for (const client of clients) {
    client.disconnect();
  }
}
