import { spawn, type ChildProcess } from 'child_process';
import type { McpServerConfig } from '../config/schema.js';
import type {
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  McpToolDefinition,
} from './types.js';

export interface McpClientOptions {
  server: McpServerConfig;
}

export class McpClient {
  private readonly server: McpServerConfig;
  private process?: ChildProcess;
  private requestId = 0;
  private pendingRequests = new Map<
    number | string,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();
  private buffer = '';
  private initialized = false;
  private tools: McpToolDefinition[] = [];

  constructor(options: McpClientOptions) {
    this.server = options.server;
  }

  get name(): string {
    return this.server.name;
  }

  getDefinitions(): McpToolDefinition[] {
    return this.tools;
  }

  async connect(): Promise<void> {
    if (this.process) return;

    const env = { ...process.env, ...this.server.env };
    this.process = spawn(this.server.command, this.server.args ?? [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data.toString('utf-8'));
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      // stderr is treated as diagnostic; ignore for now.
      void data;
    });

    this.process.on('error', (err) => {
      this.rejectAll(err);
    });

    this.process.on('close', (code) => {
      this.rejectAll(new Error(`MCP server "${this.server.name}" exited with code ${code ?? 'unknown'}`));
    });

    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'codelab-sage', version: '0.1.0' },
    });

    this.initialized = true;

    const result = (await this.sendRequest('tools/list', {})) as {
      tools?: McpToolDefinition[];
    };
    this.tools = result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.initialized) {
      throw new Error(`MCP client "${this.server.name}" is not initialized`);
    }

    const result = (await this.sendRequest('tools/call', {
      name,
      arguments: args,
    })) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    if (result.isError) {
      throw new Error(`Tool "${name}" returned an error`);
    }

    const text = result.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text)
      .filter((t): t is string => typeof t === 'string')
      .join('\n');

    return text ?? '(no content)';
  }

  disconnect(): void {
    this.rejectAll(new Error('MCP client disconnected'));
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
    }
    this.process = undefined;
    this.initialized = false;
    this.tools = [];
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (!line) continue;

      try {
        const message = JSON.parse(line) as McpJsonRpcResponse;
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);
          if (message.error) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message.result);
          }
        }
      } catch {
        // Ignore malformed lines.
      }
    }
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error(`MCP server "${this.server.name}" is not running`));
        return;
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const request: McpJsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  private rejectAll(reason: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(reason);
    }
    this.pendingRequests.clear();
  }
}
