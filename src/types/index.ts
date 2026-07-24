export interface ToolParameter {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  toolCallId: string;
  content: string;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  tool_calls?: ToolCallRequest[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LLMResponse {
  content?: string;
  toolCalls?: ToolCallRequest[];
  usage?: LLMUsage;
}

export interface LLMProvider {
  chat(options: {
    messages: Message[];
    tools: ToolDefinition[];
    model: string;
    signal?: AbortSignal;
  }): Promise<LLMResponse>;
}
