import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SessionStore } from '../../../src/session/store.js';
import type { Session } from '../../../src/session/types.js';

const TMP_DIR = path.join(os.tmpdir(), 'codelab-sage-test-session-store');

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
    store = new SessionStore({ dir: TMP_DIR });
  });

  afterEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  const sampleSession = (id: string): Session => ({
    id,
    title: `Test ${id}`,
    cwd: '/tmp/project',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    messages: [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'hello' },
    ],
    activeProvider: 'default',
    activeRole: 'coder',
    activeAgent: 'coder',
  });

  it('saves and loads a session', async () => {
    const session = sampleSession('abc');
    await store.save(session);

    const loaded = await store.load('abc');
    expect(loaded).toEqual(session);
  });

  it('returns null for missing session', async () => {
    const loaded = await store.load('missing');
    expect(loaded).toBeNull();
  });

  it('lists sessions sorted by updatedAt desc', async () => {
    await store.save(sampleSession('older'));
    await store.save({ ...sampleSession('newer'), updatedAt: '2026-01-03T00:00:00.000Z' });

    const list = await store.list();
    expect(list.map((s) => s.id)).toEqual(['newer', 'older']);
  });

  it('deletes a session', async () => {
    await store.save(sampleSession('delete-me'));
    expect(await store.exists('delete-me')).toBe(true);

    const deleted = await store.delete('delete-me');
    expect(deleted).toBe(true);
    expect(await store.exists('delete-me')).toBe(false);
  });

  it('delete returns false for missing session', async () => {
    const deleted = await store.delete('missing');
    expect(deleted).toBe(false);
  });

  it('forks a session with a new id', async () => {
    await store.save(sampleSession('original'));
    const forked = await store.fork('original', 'forked', 'Fork title');

    expect(forked).toBeDefined();
    expect(forked!.id).toBe('forked');
    expect(forked!.title).toBe('Fork title');
    expect(forked!.messages).toEqual(sampleSession('original').messages);
    expect(forked!.createdAt).not.toBe(sampleSession('original').createdAt);
  });
});
