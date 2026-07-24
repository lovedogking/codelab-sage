import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SessionManager } from '../../../src/session/manager.js';
import { SessionStore } from '../../../src/session/store.js';
import { Agent } from '../../../src/agent/agent.js';
import { createToolRegistry } from '../../../src/tools/builtins.js';
import { createLogger } from '../../../src/utils/logger.js';
import type { SageConfig } from '../../../src/config/schema.js';
import type { LLMProvider, LLMResponse, Message } from '../../../src/types/index.js';

const TMP_DIR = path.join(os.tmpdir(), 'codelab-sage-test-session-manager');

class FakeProvider implements LLMProvider {
  async chat(): Promise<LLMResponse> {
    return { content: 'ok' };
  }
}

class EchoLastUserProvider implements LLMProvider {
  async chat(options: { messages: Message[] }): Promise<LLMResponse> {
    const user = options.messages.filter((m) => m.role === 'user').pop();
    return { content: user?.content ?? '(no user)' };
  }
}

const BASE_CONFIG: SageConfig = {
  model: 'fake-model',
  apiKey: 'fake',
  confirmDestructive: false,
  tools: { bash: { requireConfirm: false } },
};

function createAgent(provider: LLMProvider): Agent {
  return new Agent({
    config: BASE_CONFIG,
    logger: createLogger('silent'),
    provider,
    registry: createToolRegistry(BASE_CONFIG),
    skills: [],
  });
}

describe('SessionManager', () => {
  let store: SessionStore;
  let manager: SessionManager;

  beforeEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
    store = new SessionStore({ dir: TMP_DIR });
    manager = new SessionManager({ config: BASE_CONFIG, store });
  });

  afterEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  it('creates a new session from agent messages', async () => {
    const agent = createAgent(new EchoLastUserProvider());
    await agent.run('hello');

    const session = await manager.create(agent, 'My session');
    expect(session.title).toBe('My session');
    expect(session.messages.length).toBeGreaterThan(0);
    expect(manager.currentId).toBe(session.id);
  });

  it('saves current session and updates it on subsequent saves', async () => {
    const agent = createAgent(new EchoLastUserProvider());
    await agent.run('first');

    const session = await manager.save(agent, 'Auto');
    const firstId = session.id;

    await agent.run('second');
    const updated = await manager.save(agent);

    expect(updated.id).toBe(firstId);
    expect(updated.messages.length).toBeGreaterThan(session.messages.length);
  });

  it('loads a session into the agent', async () => {
    const agent = createAgent(new EchoLastUserProvider());
    await agent.run('hello');
    const session = await manager.save(agent, 'To load');

    const newAgent = createAgent(new EchoLastUserProvider());
    const loaded = await manager.load(session.id, newAgent);

    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe(session.id);
    expect(newAgent.exportMessages().length).toBe(session.messages.length);
  });

  it('forks a session into a new agent', async () => {
    const agent = createAgent(new EchoLastUserProvider());
    await agent.run('hello');
    const session = await manager.save(agent, 'Original');

    const forked = await manager.fork(session.id, agent, 'Forked');
    expect(forked).toBeDefined();
    expect(forked!.id).not.toBe(session.id);
    expect(forked!.title).toBe('Forked');
    expect(manager.currentId).toBe(forked!.id);
  });

  it('deletes a session and clears current id', async () => {
    const agent = createAgent(new FakeProvider());
    const session = await manager.create(agent, 'To delete');

    const deleted = await manager.delete(session.id);
    expect(deleted).toBe(true);
    expect(manager.currentId).toBeUndefined();
  });
});
