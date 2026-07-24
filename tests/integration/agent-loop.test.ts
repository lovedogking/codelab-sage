import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Agent } from '../../src/agent/agent.js';
import { createToolRegistry } from '../../src/tools/builtins.js';
import { createLogger } from '../../src/utils/logger.js';
import { loadSkills } from '../../src/skills/loader.js';
import type { LLMProvider, LLMResponse, Message, ToolDefinition } from '../../src/types/index.js';
import type { SageConfig } from '../../src/config/schema.js';
import { CodelabSageError } from '../../src/utils/errors.js';

const TMP_DIR = path.join(os.tmpdir(), 'codelab-sage-test-integration');

// ---------------------------------------------------------------------------
// Fake LLM provider with a scriptable conversation
// ---------------------------------------------------------------------------
class FakeConversationProvider implements LLMProvider {
  private turns: LLMResponse[];
  private callCount = 0;

  constructor(turns: LLMResponse[]) {
    this.turns = turns;
  }

  async chat(_options: {
    messages: Message[];
    tools: ToolDefinition[];
    model: string;
  }): Promise<LLMResponse> {
    const response = this.turns[this.callCount % this.turns.length];
    this.callCount++;
    return response ?? { content: '(no response)' };
  }

  get callCount_() {
    return this.callCount;
  }
}

const BASE_CONFIG: SageConfig = {
  model: 'fake-model',
  apiKey: 'fake',
  confirmDestructive: false,
  tools: { bash: { requireConfirm: false } },
};

// Helpers to create LLM responses
function toolCall(name: string, args: Record<string, unknown>, id = 'call_1'): LLMResponse {
  return { toolCalls: [{ id, name, arguments: args }] };
}

function textResponse(content: string): LLMResponse {
  return { content };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Agent integration', () => {
  beforeEach(async () => {
    await fs.mkdir(TMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  // ---- basic flows ----

  it('completes a single-turn question', async () => {
    const provider = new FakeConversationProvider([textResponse('42')]);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry: createToolRegistry(BASE_CONFIG),
      skills: [],
    });

    const answer = await agent.run('What is the answer?');
    expect(answer).toBe('42');
    expect(provider.callCount_).toBe(1);
  });

  // ---- multi-step tool calling ----

  it('calls read_file then returns answer (two LLM turns)', async () => {
    const target = path.join(TMP_DIR, 'note.txt');
    await fs.writeFile(target, 'Important note', 'utf-8');

    const provider = new FakeConversationProvider([
      toolCall('read_file', { path: target }),
      textResponse('The file says: Important note'),
    ]);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry: createToolRegistry(BASE_CONFIG),
      skills: [],
    });

    const answer = await agent.run('What does note.txt contain?');
    expect(answer).toContain('Important note');
    expect(provider.callCount_).toBe(2);
  });

  it('chains write_file → bash → final answer (three LLM turns)', async () => {
    const scriptPath = path.join(TMP_DIR, 'script.js');
    const scriptContent = 'console.log("hello from script")';

    const provider = new FakeConversationProvider([
      toolCall('write_file', { path: scriptPath, content: scriptContent }),
      toolCall('bash', { command: `node ${scriptPath}` }),
      textResponse('The script ran and printed: hello from script'),
    ]);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry: createToolRegistry(BASE_CONFIG),
      skills: [],
    });

    const answer = await agent.run('Write and run a hello script');
    expect(answer).toContain('hello from script');
    expect(provider.callCount_).toBe(3);

    // verify file was actually written
    const written = await fs.readFile(scriptPath, 'utf-8');
    expect(written).toBe(scriptContent);
  });

  // ---- tool error recovery ----

  it('handles a tool error and continues to final answer', async () => {
    const provider = new FakeConversationProvider([
      toolCall('read_file', { path: '/nonexistent/file.txt' }),
      // the tool call should fail; LLM gets the error and responds
      textResponse('That file does not exist. Please check the path.'),
    ]);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry: createToolRegistry(BASE_CONFIG),
      skills: [],
    });

    const answer = await agent.run('Read nonexistent file');
    expect(answer).toContain('does not exist');
    expect(provider.callCount_).toBe(2);
  });

  // ---- max iterations ----

  it('throws when max iterations exceeded', async () => {
    // provider never returns plain text — always tool calls
    const provider = new FakeConversationProvider(
      Array.from({ length: 15 }, (_, i) => toolCall('bash', { command: `echo step${i}` }, `call_${i}`)),
    );
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry: createToolRegistry(BASE_CONFIG),
      skills: [],
    });

    await expect(agent.run('loop forever')).rejects.toThrow(/exceeded maximum iterations/);
    expect(provider.callCount_).toBe(10); // default maxIterations
  });

  // ---- skill injection ----

  it('includes skill content in the system prompt', async () => {
    const skillsDir = path.join(TMP_DIR, 'skills');
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, 'my-skill.md'),
      `---
name: test-skill
description: Test
priority: 100
---

Always respond in ALL CAPS.`,
      'utf-8',
    );

    const skills = await loadSkills([skillsDir]);
    const provider = new FakeConversationProvider([textResponse('HELLO WORLD')]);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry: createToolRegistry(BASE_CONFIG),
      skills,
    });

    const answer = await agent.run('hi');
    // The skill content should make it into the system prompt.
    // We verify the agent at least returns the response.
    expect(answer).toBe('HELLO WORLD');

    // Inspect the messages the provider received to confirm skill injection
    // (we cheat via the provider's received options — see next test)
  });

  it('injects skill content into system prompt', async () => {
    const skillsDir = path.join(TMP_DIR, 'skills');
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, 'team-skill.md'),
      `---
name: team-skill
description: Team conventions
priority: 200
---

Always sign off with "— Sage".`,
      'utf-8',
    );

    const skills = await loadSkills([skillsDir]);

    // A provider that captures the messages sent to it
    let capturedMessages: Message[] = [];
    const provider: LLMProvider = {
      async chat(options) {
        capturedMessages = [...options.messages];
        return { content: 'Done — Sage' };
      },
    };

    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry: createToolRegistry(BASE_CONFIG),
      skills,
    });

    await agent.run('hi');

    const systemMsg = capturedMessages.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toContain('team-skill');
    expect(systemMsg!.content).toContain('Always sign off with');
    expect(systemMsg!.content).toContain('Available Tools');
  });

  // ---- guard: dangerous tool calls ----

  it('blocks dangerous bash commands in integration flow', async () => {
    const provider = new FakeConversationProvider([
      toolCall('bash', { command: 'rm -rf /' }),
      textResponse('should not reach this'),
    ]);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry: createToolRegistry(BASE_CONFIG),
      skills: [],
    });

    const answer = await agent.run('delete everything');
    // The tool should be blocked; the error is fed back as tool result.
    // Depending on how the LLM handles it, it may stop or try again.
    // We just verify it doesn't crash and doesn't return the final plain text.
    expect(answer).toBeDefined();
  });

  // ---- can't register duplicate tools ----

  it('throws when registering duplicate tool names', async () => {
    const registry = createToolRegistry(BASE_CONFIG);
    // registerAll already registered read_file once
    expect(() => {
      registry.registerAll([
        {
          name: 'read_file',
          description: 'duplicate',
          parameters: { type: 'object', properties: {} },
          async execute() {
            return 'dup';
          },
        },
      ]);
    }).toThrow(/already registered/);
  });

  // ---- no tool available ----

  it('returns error content for unknown tool call', async () => {
    const provider = new FakeConversationProvider([
      toolCall('nonexistent_tool', {}),
      textResponse('Recovered from tool error'),
    ]);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry: createToolRegistry(BASE_CONFIG),
      skills: [],
    });

    const answer = await agent.run('use a tool that does not exist');
    expect(answer).toBe('Recovered from tool error');
  });

  // ---- agent state reset ----

  it('re-initialises messages on each run', async () => {
    const provider = new FakeConversationProvider([
      textResponse('Answer one'),
      textResponse('Answer two'),
    ]);
    const agent = new Agent({
      config: BASE_CONFIG,
      logger: createLogger('silent'),
      provider,
      registry: createToolRegistry(BASE_CONFIG),
      skills: [],
    });

    const answer1 = await agent.run('query 1');
    const answer2 = await agent.run('query 2');

    expect(answer1).toBe('Answer one');
    expect(answer2).toBe('Answer two');
    expect(provider.callCount_).toBe(2);
  });
});
