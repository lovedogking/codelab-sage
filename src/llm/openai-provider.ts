import OpenAI from 'openai';
import type {
  LLMProvider,
  LLMResponse,
  Message,
  ToolCallRequest,
  ToolDefinition,
} from '../types/index.js';
import { CodelabSageError } from '../utils/errors.js';

export interface OpenAIProviderOptions {
  apiKey: string;
  baseURL?: string;
}

export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI;

  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
  }

  async chat(options: {
    messages: Message[];
    tools: ToolDefinition[];
    model: string;
    signal?: AbortSignal;
  }): Promise<LLMResponse> {
    const openaiTools = options.tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    try {
      const completion = await this.client.chat.completions.create(
        {
          model: options.model,
          messages: toOpenAIMessages(options.messages),
          tools: openaiTools,
        },
        { signal: options.signal },
      );

      const choice = completion.choices[0];
      if (!choice) {
        throw new CodelabSageError('Empty response from LLM', 'LLM_EMPTY_RESPONSE');
      }

      const message = choice.message;
      const toolCalls: ToolCallRequest[] | undefined = message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseJson(tc.function.arguments),
      }));

      return {
        content: message.content ?? undefined,
        toolCalls,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      if (err instanceof CodelabSageError) throw err;
      throw new CodelabSageError(
        `LLM request failed: ${(err as Error).message}`,
        'LLM_REQUEST_ERROR',
        { cause: err },
      );
    }
  }
}

/**
 * Convert internal messages to OpenAI format.
 * Ensures each assistant tool_call has the required `type: 'function'` field,
 * which some providers (e.g. DeepSeek) enforce strictly.
 */
function toOpenAIMessages(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }
    return msg as OpenAI.Chat.ChatCompletionMessageParam;
  });
}

function safeParseJson(input: string): Record<string, unknown> {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return {};
  }
}
