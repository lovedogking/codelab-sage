export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpTextContent {
  type: 'text';
  text: string;
}

export type McpToolResultContent = McpTextContent | { type: string; [key: string]: unknown };

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}
