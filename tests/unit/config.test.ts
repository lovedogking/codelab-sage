import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadConfig } from '../../src/config/config.js';

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

  it('loads default config', async () => {
    const config = await loadConfig({});
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.confirmDestructive).toBe(true);
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
});
