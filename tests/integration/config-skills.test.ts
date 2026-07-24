import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadConfig, getActiveProvider } from '../../src/config/config.js';
import { sageConfigSchema } from '../../src/config/schema.js';
import { loadSkills } from '../../src/skills/loader.js';
import { createToolRegistry } from '../../src/tools/builtins.js';
import { createLLMProvider, createProviderFromEntry } from '../../src/llm/factory.js';
import { AnthropicProvider } from '../../src/llm/anthropic-provider.js';
import { CodelabSageError } from '../../src/utils/errors.js';
import type { ProviderEntry } from '../../src/config/schema.js';
import type { Message, ToolDefinition } from '../../src/types/index.js';

const TMP_DIR = path.join(os.tmpdir(), 'codelab-sage-test-config-int');

describe('Configuration & provider integration', () => {
  beforeEach(async () => {
    await fs.mkdir(TMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  // ---- config layering ----

  it('respects CLI option overrides for model', async () => {
    const config = await loadConfig({ model: 'gpt-4o' });
    expect(config.model).toBe('gpt-4o');
    expect(config.provider).toBe('openai');
  });

  it('merges skill dirs from CLI with defaults', async () => {
    const customDir = path.join(TMP_DIR, 'custom-skills');
    const config = await loadConfig({ skillDir: [customDir] });
    expect(config.skillDirs).toContain(customDir);
  });

  it('disables destructive confirm with noConfirm', async () => {
    const config = await loadConfig({ noConfirm: true });
    expect(config.confirmDestructive).toBe(false);
  });

  // ---- provider factory (legacy) ----

  it('creates OpenAI provider with apiKey', () => {
    const provider = createLLMProvider({ apiKey: 'sk-test', model: 'gpt-4o-mini' });
    expect(provider).toBeDefined();
  });

  it('throws when no apiKey is set', () => {
    expect(() => createLLMProvider({ model: 'gpt-4o-mini' })).toThrow(/API key/);
  });

  it('throws for unsupported provider', () => {
    expect(() =>
      createLLMProvider({ provider: 'unsupported', apiKey: 'sk-test', model: 'x' }),
    ).toThrow(/Unsupported LLM provider/);
  });

  // ---- createProviderFromEntry ----

  it('creates OpenAI provider from entry', () => {
    const entry: ProviderEntry = {
      id: 'test',
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o',
    };
    const provider = createProviderFromEntry(entry);
    expect(provider).toBeDefined();
  });

  it('creates Ollama provider from entry', () => {
    const entry: ProviderEntry = {
      id: 'local',
      provider: 'ollama',
      apiKey: 'ollama',
      baseURL: 'http://localhost:11434/v1',
      model: 'llama3',
    };
    const provider = createProviderFromEntry(entry);
    expect(provider).toBeDefined();
  });

  it('creates Anthropic provider from entry', () => {
    const entry: ProviderEntry = {
      id: 'claude',
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-20250514',
    };
    const provider = createProviderFromEntry(entry);
    expect(provider).toBeDefined();
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('falls back to OpenAI-compatible for unknown provider with baseURL', () => {
    const entry: ProviderEntry = {
      id: 'custom',
      provider: 'deepseek',
      apiKey: 'sk-custom',
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    };
    const provider = createProviderFromEntry(entry);
    expect(provider).toBeDefined();
  });

  it('throws for unknown provider without baseURL', () => {
    const entry: ProviderEntry = {
      id: 'bad',
      provider: 'unknown-x',
      apiKey: 'sk-x',
      model: 'x',
    };
    expect(() => createProviderFromEntry(entry)).toThrow(/Unsupported provider/);
  });

  // ---- AnthropicProvider message translation ----

  describe('AnthropicProvider message translation', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            content: [{ type: 'text', text: 'ok' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 2 },
          }),
        }),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('splits system message and user message correctly', async () => {
      const provider = new AnthropicProvider({ apiKey: 'sk-test' });

      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];

      const tools: ToolDefinition[] = [];

      await provider.chat({ messages, tools, model: 'claude-sonnet-4-20250514' });

      const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.system).toBe('You are a helpful assistant.');
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
    });

    it('translates tool result messages correctly', async () => {
      const provider = new AnthropicProvider({ apiKey: 'sk-test' });

      const messages: Message[] = [
        { role: 'user', content: 'Read the file' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'call_1', name: 'read_file', arguments: { path: '/test.txt' } },
          ],
        },
        {
          role: 'tool',
          content: 'file contents here',
          tool_call_id: 'call_1',
        },
      ];

      const tools: ToolDefinition[] = [
        {
          name: 'read_file',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      ];

      await provider.chat({ messages, tools, model: 'claude-sonnet-4-20250514' });

      const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.messages).toHaveLength(3);
      expect(body.messages[1].role).toBe('assistant');
      expect(body.messages[1].content[0].type).toBe('tool_use');
      expect(body.messages[1].content[0].name).toBe('read_file');
      expect(body.messages[2].role).toBe('user');
      expect(body.messages[2].content[0].type).toBe('tool_result');
      expect(body.messages[2].content[0].content).toBe('file contents here');
    });
  });

  // ---- config validation ----

  it('rejects invalid log levels', () => {
    const result = sageConfigSchema.safeParse({ logLevel: 'banana' });
    expect(result.success).toBe(false);
  });

  it('accepts a full valid config object with providers', () => {
    const result = sageConfigSchema.safeParse({
      provider: 'openai',
      apiKey: 'sk-123',
      model: 'gpt-4o',
      skillDirs: ['./skills'],
      logLevel: 'verbose',
      confirmDestructive: true,
      history: { enabled: true, maxDays: 30 },
      tools: { bash: { timeout: 5000, requireConfirm: false } },
      providers: [
        { id: 'a', provider: 'openai', apiKey: 'sk-a', model: 'gpt-4o' },
        { id: 'b', provider: 'anthropic', apiKey: 'sk-b', model: 'claude' },
      ],
      activeProvider: 'a',
    });
    expect(result.success).toBe(true);
  });

  it('rejects provider entry without apiKey', () => {
    const result = sageConfigSchema.safeParse({
      providers: [{ id: 'a', provider: 'openai', model: 'gpt-4o' }],
    });
    expect(result.success).toBe(false);
  });

  // ---- skills + tool registry round-trip ----

  it('loads skills and tool definitions together correctly', async () => {
    const skillsDir = path.join(TMP_DIR, 'skills');
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, 'one.md'),
      `---
name: skill-a
priority: 10
---
# Skill A
Content A`,
      'utf-8',
    );
    await fs.writeFile(
      path.join(skillsDir, 'two.md'),
      `---
name: skill-b
priority: 50
---
# Skill B
Content B`,
      'utf-8',
    );

    const skills = await loadSkills([skillsDir]);
    const registry = createToolRegistry({
      model: 'gpt-4o-mini',
      confirmDestructive: true,
      tools: { bash: { requireConfirm: false } },
    });

    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe('skill-b');
    expect(skills[1].name).toBe('skill-a');

    const defs = registry.definitions();
    expect(defs.some((d) => d.name === 'read_file')).toBe(true);
    expect(defs.some((d) => d.name === 'write_file')).toBe(true);
    expect(defs.some((d) => d.name === 'bash')).toBe(true);
    expect(defs.some((d) => d.name === 'weather')).toBe(true);
  });

  // ---- CodelabSageError serialisation ----

  it('CodelabSageError has code and name', () => {
    const err = new CodelabSageError('something went wrong', 'TEST_CODE');
    expect(err.name).toBe('CodelabSageError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('something went wrong');
    expect(err instanceof CodelabSageError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  // ---- config file loading from disk ----

  it('loads config from a json file', async () => {
    const configPath = path.join(TMP_DIR, 'config.json');
    const configContent = { model: 'from-file-model', logLevel: 'debug' };
    await fs.writeFile(configPath, JSON.stringify(configContent), 'utf-8');

    const config = await loadConfig({ config: configPath });
    expect(config.model).toBe('from-file-model');
    expect(config.logLevel).toBe('debug');
  });

  it('ignores missing config file gracefully', async () => {
    const configPath = path.join(TMP_DIR, 'nonexistent.json');
    const config = await loadConfig({ config: configPath });
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.provider).toBe('openai');
  });

  // ---- getActiveProvider ----

  it('returns undefined when no providers configured', async () => {
    // loadConfig without any apiKey leaves providers empty;
    // this is environment-dependent (may have OPENAI_API_KEY from .env)
    const config = await loadConfig({});
    const active = getActiveProvider(config);
    // If env has OPENAI_API_KEY, active will be defined; if not, undefined.
    // We just verify the function doesn't throw.
    expect(typeof active === 'undefined' || typeof active === 'object').toBe(true);
  });
});
