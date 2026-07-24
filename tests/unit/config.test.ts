import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadConfig, getActiveProvider, saveConfig } from '../../src/config/config.js';

const TMP_DIR = path.join(os.tmpdir(), 'codelab-sage-test-config');

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data), 'utf-8');
}

describe('loadConfig', () => {
  beforeEach(async () => {
    await fs.mkdir(TMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  it('loads default config with expected top-level fields', async () => {
    // Use a clean config file to isolate from user's ~/.codelab-sage/config.json
    const configPath = path.join(TMP_DIR, 'default-test.json');
    await writeJson(configPath, {});
    const config = await loadConfig({ config: configPath });
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.confirmDestructive).toBe(true);
    expect(config.activeProvider).toBe('');
    expect(Array.isArray(config.providers)).toBe(true);
  });

  it('overrides model from CLI options', async () => {
    const config = await loadConfig({ model: 'gpt-4o' });
    expect(config.model).toBe('gpt-4o');
  });

  it('loads user config file', async () => {
    const configPath = path.join(TMP_DIR, 'config.json');
    await writeJson(configPath, { model: 'custom-model', logLevel: 'debug' });

    const config = await loadConfig({ config: configPath });
    expect(config.model).toBe('custom-model');
    expect(config.logLevel).toBe('debug');
  });

  it('merges skill dirs from CLI', async () => {
    const customDir = path.join(TMP_DIR, 'skills');
    const config = await loadConfig({ skillDir: [customDir] });
    expect(config.skillDirs).toContain(customDir);
  });

  it('auto-creates default provider from legacy apiKey cli option', async () => {
    // Use a clean config file without providers to test the legacy fallback
    const configPath = path.join(TMP_DIR, 'legacy-config.json');
    await writeJson(configPath, {});

    const config = await loadConfig({ config: configPath, apiKey: 'sk-legacy-key' });
    expect(config.providers).toBeDefined();
    const provider = config.providers!.find((p) => p.apiKey === 'sk-legacy-key');
    expect(provider).toBeDefined();
  });

  it('loads providers from config file', async () => {
    const configPath = path.join(TMP_DIR, 'config.json');
    await writeJson(configPath, {
      providers: [
        { id: 'my-gpt', provider: 'openai', apiKey: 'sk-123', model: 'gpt-4o' },
        { id: 'my-deepseek', provider: 'deepseek', apiKey: 'sk-ds', model: 'deepseek-chat' },
      ],
      activeProvider: 'my-gpt',
    });

    const config = await loadConfig({ config: configPath });
    expect(config.providers).toHaveLength(2);
    expect(config.providers![0].id).toBe('my-gpt');
    expect(config.providers![1].provider).toBe('deepseek');
    expect(config.activeProvider).toBe('my-gpt');

    const active = getActiveProvider(config);
    expect(active!.id).toBe('my-gpt');
  });

  it('getActiveProvider returns first provider when no active set', async () => {
    const configPath = path.join(TMP_DIR, 'config.json');
    await writeJson(configPath, {
      providers: [
        { id: 'a', provider: 'openai', apiKey: 'sk-a', model: 'gpt-4o' },
        { id: 'b', provider: 'anthropic', apiKey: 'sk-b', model: 'claude' },
      ],
    });

    const config = await loadConfig({ config: configPath });
    const active = getActiveProvider(config);
    expect(active!.id).toBe('a');
  });

  it('loads activeRole from config file', async () => {
    const configPath = path.join(TMP_DIR, 'config.json');
    await writeJson(configPath, { activeRole: 'architect' });

    const config = await loadConfig({ config: configPath });
    expect(config.activeRole).toBe('architect');
  });

  it('overrides activeRole from CLI options', async () => {
    const configPath = path.join(TMP_DIR, 'config.json');
    await writeJson(configPath, { activeRole: 'reviewer' });

    const config = await loadConfig({ config: configPath, role: 'architect' });
    expect(config.activeRole).toBe('architect');
  });
});

describe('saveConfig', () => {
  beforeEach(async () => {
    await fs.mkdir(TMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  it('persists activeRole', async () => {
    const configPath = path.join(TMP_DIR, 'saved-config.json');
    await saveConfig({ activeRole: 'architect' }, configPath);

    const config = await loadConfig({ config: configPath });
    expect(config.activeRole).toBe('architect');
  });
});
