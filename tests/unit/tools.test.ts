import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createToolRegistry } from '../../src/tools/builtins.js';
import type { SageConfig } from '../../src/config/schema.js';

const TMP_DIR = path.join(os.tmpdir(), 'codelab-sage-test-tools');

const TEST_CONFIG: SageConfig = {
  confirmDestructive: false,
  tools: {
    bash: {
      timeout: 5000,
      requireConfirm: false,
    },
  },
};

describe('built-in tools', () => {
  beforeEach(async () => {
    await fs.mkdir(TMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  it('read_file reads existing file', async () => {
    const filePath = path.join(TMP_DIR, 'hello.txt');
    await fs.writeFile(filePath, 'hello world', 'utf-8');

    const registry = createToolRegistry(TEST_CONFIG);
    const tool = registry.get('read_file')!;
    const result = await tool.execute({ path: filePath });
    expect(result).toBe('hello world');
  });

  it('write_file writes content', async () => {
    const filePath = path.join(TMP_DIR, 'out.txt');
    const registry = createToolRegistry(TEST_CONFIG);
    const tool = registry.get('write_file')!;
    const result = await tool.execute({ path: filePath, content: 'written' });
    expect(result).toContain('Wrote');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('written');
  });

  it('bash echoes command output', async () => {
    const registry = createToolRegistry(TEST_CONFIG);
    const tool = registry.get('bash')!;
    const result = await tool.execute({ command: 'echo hello' });
    expect(result).toContain('hello');
  });

  it('bash blocks dangerous patterns', async () => {
    const registry = createToolRegistry(TEST_CONFIG);
    const tool = registry.get('bash')!;
    await expect(tool.execute({ command: 'rm -rf /' })).rejects.toThrow();
  });
});
