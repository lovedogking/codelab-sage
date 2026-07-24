import type {
  LLMProvider,
  LLMResponse,
  Message,
  ToolCallRequest,
  ToolDefinition,
} from '../types/index.js';
import { CodelabSageError } from '../utils/errors.js';

export interface AnthropicProviderOptions {
  apiKey: string;
  baseURL?: string;
}

/**
 * AnthropicProvider implements the LLMProvider interface for Anthropic's
 * Messages API. It translates internal message/tool formats to Anthropic's
 * content-block based format at the edge of the provider, so the Agent
 * loop stays provider-agnostic.
 *
 * Key differences from OpenAI:
 * - system prompt is a top-level parameter, not a message
 * - messages only use "user" and "assistant" roles
 * - tool calls/results are content blocks, not top-level fields
 */
export class AnthropicProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL ?? 'https://api.anthropic.com/v1';
  }

  async chat(options: {
    messages: Message[];
    tools: ToolDefinition[];
    model: string;
    signal?: AbortSignal;
  }): Promise<LLMResponse> {
    const { systemPrompt, userMessages } = this.splitMessages(options.messages);
    const anthropicTools = this.convertTools(options.tools);

    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: 4096,
      messages: userMessages,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (anthropicTools.length > 0) {
      body.tools = anthropicTools;
    }

    try {
      const response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: options.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new CodelabSageError(
          `Anthropic API error ${response.status}: ${errText}`,
          'LLM_REQUEST_ERROR',
        );
      }

      const data = (await response.json()) as Record<string, unknown>;
      return this.parseResponse(data);
    } catch (err) {
      if (err instanceof CodelabSageError) throw err;
      throw new CodelabSageError(
        `LLM request failed: ${(err as Error).message}`,
        'LLM_REQUEST_ERROR',
        { cause: err },
      );
    }
  }

  // ------------------------------------------------------------------
  // Message translation
  // ------------------------------------------------------------------

  /**
   * Separate system messages from user/assistant/tool messages.
   * Handles tool-call conversion for assistant messages and tool
   * result conversion for tool messages.
   */
  private splitMessages(messages: Message[]): {
    systemPrompt: string | undefined;
    userMessages: Record<string, unknown>[];
  } {
    const systemParts: string[] = [];
    const userMessages: Record<string, unknown>[] = [];

    for (const msg of messages) {
      switch (msg.role) {
        case 'system':
          systemParts.push(msg.content);
          break;

        case 'user':
          userMessages.push({
            role: 'user',
            content: [{ type: 'text', text: msg.content }],
          });
          break;

        case 'assistant':
          userMessages.push(this.convertAssistantMessage(msg));
          break;

        case 'tool':
          userMessages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.tool_call_id,
                content: msg.content,
              },
            ],
          });
          break;
      }
    }

    return {
      systemPrompt: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      userMessages,
    };
  }

  /**
   * Convert our internal assistant messages to Anthropic format.
   * If the message has tool_calls, emit tool_use blocks.
   */
  private convertAssistantMessage(msg: Message): Record<string, unknown> {
    const blocks: Record<string, unknown>[] = [];

    if (msg.content) {
      blocks.push({ type: 'text', text: msg.content });
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
    }

    return {
      role: 'assistant',
      content: blocks,
    };
  }

  // ------------------------------------------------------------------
  // Tool translation
  // ------------------------------------------------------------------

  private convertTools(tools: ToolDefinition[]): Record<string, unknown>[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.parameters.properties ?? {},
        required: tool.parameters.required ?? [],
      },
    }));
  }

  // ------------------------------------------------------------------
  // Response parsing
  // ------------------------------------------------------------------

  private parseResponse(data: Record<string, unknown>): LLMResponse {
    const stopReason = data.stop_reason as string | undefined;
    const content = data.content as Array<Record<string, unknown>> | undefined;

    if (!content || content.length === 0) {
      return { content: '(empty response)' };
    }

    const textParts: string[] = [];
    const toolCalls: ToolCallRequest[] = [];

    for (const block of content) {
      const blockType = block.type as string;
      if (blockType === 'text') {
        textParts.push((block.text as string) ?? '');
      } else if (blockType === 'tool_use') {
        toolCalls.push({
          id: (block.id as string) ?? '',
          name: (block.name as string) ?? '',
          arguments: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }

    const usage = data.usage as Record<string, unknown> | undefined;

    return {
      content: textParts.join('\n') || (stopReason === 'end_turn' ? undefined : undefined),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: usage
        ? {
            promptTokens: usage.input_tokens as number,
            completionTokens: usage.output_tokens as number,
            totalTokens: ((usage.input_tokens as number) ?? 0) + ((usage.output_tokens as number) ?? 0),
          }
        : undefined,
    };
  }
}
