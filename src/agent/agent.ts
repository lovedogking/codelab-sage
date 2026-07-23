import type { SageConfig } from '../config/schema.js';
import type { Logger } from '../utils/logger.js';
import type { LLMProvider } from '../llm/provider.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Skill } from '../skills/skill.js';
import type { Message, ToolCallResult } from '../types/index.js';
import { buildSystemPrompt } from './prompt.js';
import { executeToolCalls } from '../tools/executor.js';
import { CodelabSageError } from '../utils/errors.js';

export interface AgentOptions {
  config: SageConfig;
  logger: Logger;
  provider: LLMProvider;
  registry: ToolRegistry;
  skills: Skill[];
}

export class Agent {
  private readonly config: SageConfig;
  private readonly logger: Logger;
  private readonly provider: LLMProvider;
  private readonly registry: ToolRegistry;
  private readonly skills: Skill[];
  private readonly messages: Message[] = [];
  private readonly maxIterations: number;
  private initialized = false;

  constructor(options: AgentOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.provider = options.provider;
    this.registry = options.registry;
    this.skills = options.skills;
    this.maxIterations = 10;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const systemPrompt = await buildSystemPrompt(this.skills, this.registry.definitions());
    this.messages.push({ role: 'system', content: systemPrompt });
    this.initialized = true;
  }

  async run(query: string): Promise<string> {
    await this.initialize();
    this.messages.push({ role: 'user', content: query });

    for (let i = 0; i < this.maxIterations; i++) {
      this.logger.verbose(`Iteration ${i + 1}: sending ${this.messages.length} messages`);

      const response = await this.provider.chat({
        messages: this.messages,
        tools: this.registry.definitions(),
        model: this.config.model ?? 'gpt-4o-mini',
      });

      this.logger.verbose('LLM response', response);

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content ?? '',
      };
      if (response.toolCalls && response.toolCalls.length > 0) {
        assistantMessage.tool_calls = response.toolCalls;
      }
      this.messages.push(assistantMessage);

      if (response.content && !response.toolCalls?.length) {
        return response.content;
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        this.logger.info(`Executing ${response.toolCalls.length} tool call(s)...`);
        const results: ToolCallResult[] = await executeToolCalls(this.registry, response.toolCalls);
        for (const result of results) {
          this.messages.push({
            role: 'tool',
            content: result.content,
            tool_call_id: result.toolCallId,
          });
        }
        continue;
      }

      return '(No response from agent)';
    }

    throw new CodelabSageError(
      `Agent exceeded maximum iterations (${this.maxIterations})`,
      'AGENT_MAX_ITERATIONS',
    );
  }
}
