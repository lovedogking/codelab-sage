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
});
