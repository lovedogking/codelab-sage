import type { SageConfig, ProviderEntry } from '../config/schema.js';
import type { Logger } from '../utils/logger.js';
import type { LLMProvider } from '../llm/provider.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Skill } from '../skills/skill.js';
import { filterSkillsByRole } from '../skills/loader.js';
import type { LLMResponse, Message, ToolCallResult } from '../types/index.js';
import { buildSystemPrompt } from './prompt.js';
import {
  calculateContextStats,
  estimateMessagesTokens,
  formatContextIndicator,
  type ContextStats,
} from '../utils/context.js';
import { executeToolCalls } from '../tools/executor.js';
import { CodelabSageError } from '../utils/errors.js';

export interface AgentOptions {
  config: SageConfig;
  logger: Logger;
  provider: LLMProvider;
  registry: ToolRegistry;
  skills: Skill[];
  /** Active provider entry (for model name, etc.) */
  activeEntry?: ProviderEntry;
  /** Active role used to filter skills */
  activeRole?: string;
  /** Optional system prompt override. If provided, replaces the skill-built prompt. */
  systemPromptOverride?: string;
  /** Optional initial messages to seed the conversation. */
  initialMessages?: Message[];
}

export class Agent {
  private readonly config: SageConfig;
  private readonly logger: Logger;
  private provider: LLMProvider;
  private readonly registry: ToolRegistry;
  private readonly allSkills: Skill[];
  private activeRole?: string;
  private readonly messages: Message[] = [];
  private readonly maxIterations: number;
  private initialized = false;
  private activeEntry: ProviderEntry | undefined;
  /** Whether the last assistant message has pending tool calls */
  private hasPendingToolCalls = false;
  private readonly systemPromptOverride?: string;
  private readonly initialMessages?: Message[];

  constructor(options: AgentOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.provider = options.provider;
    this.registry = options.registry;
    this.allSkills = options.skills;
    this.activeRole = options.activeRole;
    this.activeEntry = options.activeEntry;
    this.systemPromptOverride = options.systemPromptOverride;
    this.initialMessages = options.initialMessages;
    this.maxIterations = 10;
  }

  /** The currently active provider entry (model name, etc.) */
  get currentEntry(): ProviderEntry | undefined {
    return this.activeEntry;
  }

  /** The currently active role (if any). */
  get currentRole(): string | undefined {
    return this.activeRole;
  }

  /**
   * Get the most recent non-system messages.
   * Used by sub-agents to inherit context from the main conversation.
   */
  getRecentMessages(limit = 5): Message[] {
    return this.messages.filter((m) => m.role !== 'system').slice(-limit);
  }

  /**
   * Export the full conversation, including the system prompt.
   */
  exportMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Replace the current conversation with a previously exported one.
   * Re-initializes the agent so the system prompt from the session is used.
   */
  importMessages(messages: Message[]): void {
    this.messages.length = 0;
    this.messages.push(...messages);
    this.initialized = true;
    this.hasPendingToolCalls = false;
  }

  /** All skills loaded at startup, before role filtering. */
  getAllSkills(): Skill[] {
    return this.allSkills;
  }

  /** Available roles derived from loaded skills. */
  getAvailableRoles(): string[] {
    const roles = new Set<string>();
    for (const skill of this.allSkills) {
      if (skill.role) {
        roles.add(skill.role);
      }
    }
    return Array.from(roles).sort();
  }

  /** Estimate the current context window in tokens. */
  estimateContextTokens(): number {
    return estimateMessagesTokens(this.messages);
  }

  /** Get context usage statistics against the configured limit. */
  getContextStats(): ContextStats {
    const limit = this.config.contextLimit ?? 128000;
    return calculateContextStats(this.messages, limit);
  }

  /** Format the current context usage for display. */
  formatContextIndicator(): string {
    return formatContextIndicator(this.getContextStats());
  }

  /**
   * Compact the conversation history by dropping oldest exchanges until the
   * context is below 50% of the configured limit. Always keeps the system
   * prompt and at least the most recent exchange.
   * Returns the number of removed messages.
   */
  compact(): number {
    const before = this.messages.length;
    const limit = this.config.contextLimit ?? 128000;
    const target = Math.floor(limit * 0.5);

    // Keep compacting until we're under the target. Never remove the latest
    // exchange so the current topic stays coherent.
    while (this.estimateContextTokens() > target) {
      // Find the first non-system message (start of oldest exchange).
      const firstNonSystem = this.messages.findIndex((m) => m.role !== 'system');
      if (firstNonSystem < 0) break;

      // Find the start of the next user message (end of current exchange).
      const nextUser = this.messages.findIndex(
        (m, i) => i > firstNonSystem && m.role === 'user',
      );
      const removeEnd = nextUser >= 0 ? nextUser : this.messages.length;

      // Never remove the very last exchange (keep at least system + latest user/assistant).
      if (removeEnd >= this.messages.length) break;

      // Remove this exchange.
      this.messages.splice(firstNonSystem, removeEnd - firstNonSystem);
    }

    return before - this.messages.length;
  }

  private getFilteredSkills(): Skill[] {
    return filterSkillsByRole(this.allSkills, this.activeRole);
  }

  initialize(): void {
    if (this.initialized) return;

    let systemPrompt: string;
    const filteredSkills = this.getFilteredSkills();
    const skillContent =
      filteredSkills.length > 0
        ? '\n\n# Injected Skills\n\n' +
          filteredSkills.map((skill) => `## Skill: ${skill.name}\n${skill.content}`).join('\n\n')
        : '';

    if (this.systemPromptOverride) {
      const toolDescriptions = this.registry
        .definitions()
        .map((tool) => `- ${tool.name}: ${tool.description}`)
        .join('\n');
      systemPrompt = `${this.systemPromptOverride}\n\n# Available Tools\n\n${toolDescriptions}${skillContent}`;
    } else {
      systemPrompt = buildSystemPrompt(filteredSkills, this.registry.definitions());
    }

    this.messages.push({ role: 'system', content: systemPrompt });

    if (this.initialMessages && this.initialMessages.length > 0) {
      this.messages.push(...this.initialMessages);
    }

    this.initialized = true;
  }

  /**
   * Switch to a different provider at runtime.
   * Rejects if there are pending tool calls that haven't been processed.
   */
  switchProvider(entry: ProviderEntry, newProvider: LLMProvider): void {
    if (this.hasPendingToolCalls) {
      throw new CodelabSageError(
        'Cannot switch models while tool calls are pending. Wait for the current response to complete first.',
        'SWITCH_PENDING_TOOLS',
      );
    }
    this.provider = newProvider;
    this.activeEntry = entry;
  }

  /**
   * Switch to a different role at runtime.
   * Rebuilds the system prompt and clears the conversation history.
   * Rejects if there are pending tool calls.
   */
  switchRole(role?: string): void {
    if (this.hasPendingToolCalls) {
      throw new CodelabSageError(
        'Cannot switch roles while tool calls are pending. Wait for the current response to complete first.',
        'SWITCH_PENDING_TOOLS',
      );
    }

    this.activeRole = role || undefined;
    this.messages.length = 0;

    const filteredSkills = this.getFilteredSkills();
    const systemPrompt = buildSystemPrompt(filteredSkills, this.registry.definitions());
    this.messages.push({ role: 'system', content: systemPrompt });
    this.initialized = true;
  }

  async run(query: string, signal?: AbortSignal): Promise<string> {
    this.initialize();
    this.hasPendingToolCalls = false;
    this.messages.push({ role: 'user', content: query });
    return this.runLoop(signal);
  }

  /**
   * Run the agent with a specific task and optional parent conversation context.
   * Useful for sub-agents that need to inherit some history from the main agent.
   */
  async runWithContext(query: string, parentMessages?: Message[], signal?: AbortSignal): Promise<string> {
    this.initialize();
    this.hasPendingToolCalls = false;

    if (parentMessages && parentMessages.length > 0) {
      const limit = 5;
      const recent = parentMessages.slice(-limit);
      this.messages.push(...recent);
    }

    this.messages.push({ role: 'user', content: query });
    return this.runLoop(signal);
  }

  private async runLoop(signal?: AbortSignal): Promise<string> {
    const model = this.activeEntry?.model ?? this.config.model ?? 'gpt-4o-mini';

    for (let i = 0; i < this.maxIterations; i++) {
      if (signal?.aborted) {
        throw new CodelabSageError('Thinking interrupted.', 'USER_ABORTED');
      }

      this.logger.verbose(
        `Iteration ${i + 1}: sending ${this.messages.length} messages to ${model}`,
      );

      let response: LLMResponse;
      try {
        response = await this.provider.chat({
          messages: this.messages,
          tools: this.registry.definitions(),
          model,
          signal,
        });
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) {
          throw new CodelabSageError('Thinking interrupted.', 'USER_ABORTED');
        }
        throw err;
      }

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
        this.hasPendingToolCalls = false;
        return response.content;
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        this.hasPendingToolCalls = true;
        this.logger.info(`Executing ${response.toolCalls.length} tool call(s)...`);
        const results: ToolCallResult[] = await executeToolCalls(this.registry, response.toolCalls);
        for (const result of results) {
          this.messages.push({
            role: 'tool',
            content: result.content,
            tool_call_id: result.toolCallId,
          });
        }
        this.hasPendingToolCalls = false;
        continue;
      }

      this.hasPendingToolCalls = false;
      return '(No response from agent)';
    }

    this.hasPendingToolCalls = false;
    throw new CodelabSageError(
      `Agent exceeded maximum iterations (${this.maxIterations})`,
      'AGENT_MAX_ITERATIONS',
    );
  }
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'AbortError' ||
    err.message.toLowerCase().includes('abort') ||
    err.message.toLowerCase().includes('cancel') ||
    err.message.toLowerCase().includes('user aborted')
  );
}
