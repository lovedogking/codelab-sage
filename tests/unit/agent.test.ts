import { describe, it, expect } from 'vitest';
import { Agent } from '../../src/agent/agent.js';
import { createToolRegistry } from '../../src/tools/builtins.js';
import { createLogger } from '../../src/utils/logger.js';
import type { LLMProvider, LLMResponse, Message, ToolDefinition } from '../../src/types/index.js';
import type { SageConfig } from '../../src/config/schema.js';

class FakeProvider implements LLMProvider {
  private responses: LLMResponse[];

  constructor(responses: LLMResponse[]) {
    this.responses = responses;
  }

  async chat(): Promise<LLMResponse> {
    const response = this.responses.shift();
    if (!response) {
      return { content: '(no more responses)' };
    }
    return response;
  }
}

class EchoSystemPromptProvider implements LLMProvider {
  async chat(options: { messages: Message[] }): Promise<LLMResponse> {
    const system = options.messages.find((m) => m.role === 'system');
    return { content: system?.content ?? '(no system prompt)' };
  }
}

class EchoLastUserMessageProvider implements LLMProvider {
  async chat(options: { messages: Message[] }): Promise<LLMResponse> {
    const userMessages = options.messages.filter((m) => m.role === 'user');
    const last = userMessages[userMessages.length - 1];
    return { content: last?.content ?? '(no user message)' };
  }
}

const BASE_CONFIG: SageConfig = {
  model: 'fake-model',
  apiKey: 'fake',
  confirmDestructive: false,
  tools: { bash: { requireConfirm: false } },
};

describe('Agent', () => {
  it('returns direct LLM answer without tools', async () => {
    const provider = new FakeProvider([{ content: 'Hello from Sage' }]);
    const registry = createToolRegistry(BASE_CONFIG);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry,
      skills: [],
    });

    const answer = await agent.run('hi');
    expect(answer).toBe('Hello from Sage');
  });

  it('executes a tool call and returns final answer', async () => {
    const provider = new FakeProvider([
      {
        toolCalls: [
          {
            id: 'call_1',
            name: 'bash',
            arguments: { command: 'echo hello' },
          },
        ],
      },
      { content: 'Done' },
    ]);

    const registry = createToolRegistry(BASE_CONFIG);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry,
      skills: [],
    });

    const answer = await agent.run('run echo');
    expect(answer).toBe('Done');
  });

  it('filters skills by active role on initialization', async () => {
    const provider = new EchoSystemPromptProvider();
    const registry = createToolRegistry(BASE_CONFIG);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry,
      skills: [
        { name: 'base', content: 'BASE_RULE', filePath: '/tmp/base.md', priority: 0 },
        { name: 'architect', role: 'architect', content: 'ARCH_RULE', filePath: '/tmp/arch.md', priority: 10 },
        { name: 'reviewer', role: 'reviewer', content: 'REVIEW_RULE', filePath: '/tmp/rev.md', priority: 10 },
      ],
      activeRole: 'architect',
    });

    const systemPrompt = await agent.run('hi');
    expect(systemPrompt).toContain('BASE_RULE');
    expect(systemPrompt).toContain('ARCH_RULE');
    expect(systemPrompt).not.toContain('REVIEW_RULE');
  });

  it('switchRole rebuilds system prompt and clears history', async () => {
    const provider = new EchoLastUserMessageProvider();
    const registry = createToolRegistry(BASE_CONFIG);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry,
      skills: [
        { name: 'base', content: 'BASE_RULE', filePath: '/tmp/base.md', priority: 0 },
        { name: 'architect', role: 'architect', content: 'ARCH_RULE', filePath: '/tmp/arch.md', priority: 10 },
      ],
    });

    await agent.run('first');
    expect(agent.currentRole).toBeUndefined();

    agent.switchRole('architect');
    expect(agent.currentRole).toBe('architect');

    const answer = await agent.run('second');
    expect(answer).toBe('second');
  });

  it('switchRole rejects unknown role values gracefully by clearing role', async () => {
    const provider = new EchoSystemPromptProvider();
    const registry = createToolRegistry(BASE_CONFIG);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry,
      skills: [
        { name: 'base', content: 'BASE_RULE', filePath: '/tmp/base.md', priority: 0 },
      ],
      activeRole: 'architect',
    });

    agent.switchRole(undefined);
    expect(agent.currentRole).toBeUndefined();

    const systemPrompt = await agent.run('hi');
    expect(systemPrompt).toContain('BASE_RULE');
  });

  it('getRecentMessages returns non-system messages', async () => {
    const provider = new FakeProvider([{ content: 'first-response' }, { content: 'second-response' }]);
    const registry = createToolRegistry(BASE_CONFIG);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry,
      skills: [],
    });

    await agent.run('first');
    await agent.run('second');

    const recent = agent.getRecentMessages(2);
    expect(recent).toHaveLength(2);
    expect(recent.map((m) => m.content)).toEqual(['second', 'second-response']);
  });

  it('runWithContext inherits parent messages', async () => {
    const provider = new EchoLastUserMessageProvider();
    const registry = createToolRegistry(BASE_CONFIG);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry,
      skills: [],
    });

    await agent.run('parent-context');

    const subAgent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry,
      skills: [],
    });

    const answer = await subAgent.runWithContext('sub-task', agent.getRecentMessages());
    expect(answer).toBe('sub-task');
  });

  it('aborts run when signal is triggered', async () => {
    const controller = new AbortController();
    const provider: LLMProvider = {
      async chat({ signal }) {
        return new Promise<LLMResponse>((_, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Should have been aborted'));
          }, 1000);
          signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error('Aborted'));
          });
        });
      },
    };

    const registry = createToolRegistry(BASE_CONFIG);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry,
      skills: [],
    });

    const runPromise = agent.run('hi', controller.signal);
    controller.abort();

    await expect(runPromise).rejects.toThrow('Thinking interrupted.');
  });

  it('compacts conversation by removing oldest exchanges', async () => {
    const provider = new FakeProvider([
      { content: 'first response' },
      { content: 'second response' },
      { content: 'third response' },
    ]);
    const registry = createToolRegistry(BASE_CONFIG);
    const config: SageConfig = { ...BASE_CONFIG, contextLimit: 20 };
    const agent = new Agent({
      config,
      logger: createLogger('silent'),
      provider,
      registry,
      skills: [],
    });

    await agent.run('first');
    await agent.run('second');
    await agent.run('third');

    const beforeCount = agent.exportMessages().length;
    const removed = agent.compact();
    const afterCount = agent.exportMessages().length;

    expect(removed).toBeGreaterThan(0);
    expect(afterCount).toBeLessThan(beforeCount);
    // The most recent exchange should still be present.
    const recent = agent.getRecentMessages(2);
    expect(recent.map((m) => m.content)).toContain('third');
    expect(recent.map((m) => m.content)).toContain('third response');
  });
});
