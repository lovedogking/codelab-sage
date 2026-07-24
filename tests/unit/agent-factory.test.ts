import { describe, it, expect } from 'vitest';
import { AgentFactory } from '../../src/agent/agent-factory.js';
import { createToolRegistry } from '../../src/tools/builtins.js';
import { createLogger } from '../../src/utils/logger.js';
import type { LLMProvider, LLMResponse, Message } from '../../src/types/index.js';
import type { SageConfig } from '../../src/config/schema.js';
import type { AgentDefinition } from '../../src/agent/types.js';
import { ToolRegistry } from '../../src/tools/registry.js';

class FakeProvider implements LLMProvider {
  async chat(options: { messages: Message[] }): Promise<LLMResponse> {
    const system = options.messages.find((m) => m.role === 'system');
    return { content: system?.content ?? '(no system prompt)' };
  }
}

const BASE_CONFIG: SageConfig = {
  model: 'fake-model',
  apiKey: 'fake',
  confirmDestructive: false,
  tools: { bash: { requireConfirm: false } },
};

describe('AgentFactory', () => {
  const registry = createToolRegistry(BASE_CONFIG);
  const skills = [
    { name: 'base', content: 'BASE', filePath: '/tmp/base.md', tags: ['general'] },
    { name: 'coder-skill', content: 'CODER', filePath: '/tmp/coder.md', tags: ['code'] },
    { name: 'explore-skill', content: 'EXPLORE', filePath: '/tmp/explore.md', tags: ['explore'] },
  ];

  const agentOptions = {
    config: BASE_CONFIG,
    logger: createLogger('silent'),
    provider: new FakeProvider(),
    registry,
    skills,
  };

  const definitions: AgentDefinition[] = [
    {
      name: 'coder',
      description: 'Coder agent',
      systemPrompt: 'You are a coder.',
      toolNames: ['read_file', 'write_file', 'search_code'],
      skillTags: ['code'],
    },
    {
      name: 'explore',
      description: 'Explore agent',
      systemPrompt: 'You are an explorer.',
      toolNames: ['read_file', 'search_files'],
      skillTags: ['explore'],
    },
  ];

  it('lists agent definitions', () => {
    const factory = new AgentFactory({
      baseOptions: agentOptions,
      toolRegistry: registry,
      skills,
      agents: new Map(definitions.map((d) => [d.name, d])),
    });

    expect(factory.getDefinitions().map((d) => d.name)).toEqual(['coder', 'explore']);
    expect(factory.has('coder')).toBe(true);
    expect(factory.has('unknown')).toBe(false);
  });

  it('filters tools and skills for a sub-agent', async () => {
    const factory = new AgentFactory({
      baseOptions: agentOptions,
      toolRegistry: registry,
      skills,
      agents: new Map(definitions.map((d) => [d.name, d])),
    });

    const coder = factory.createAgent('coder');
    const coderRegistry = (coder as unknown as { registry: ToolRegistry }).registry;
    const coderTools = coderRegistry.definitions().map((t) => t.name);
    expect(coderTools).toContain('read_file');
    expect(coderTools).toContain('search_code');
    expect(coderTools).not.toContain('bash');
    expect(coderTools).not.toContain('weather');

    const prompt = await coder.run('hi');
    expect(prompt).toContain('You are a coder.');
    expect(prompt).toContain('CODER');
    expect(prompt).not.toContain('EXPLORE');
  });

  it('throws for unknown agent', () => {
    const factory = new AgentFactory({
      baseOptions: agentOptions,
      toolRegistry: registry,
      skills,
      agents: new Map(),
    });

    expect(() => factory.createAgent('missing')).toThrow('Unknown agent: missing');
  });
});
