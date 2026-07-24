import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { searchCode, searchFiles } from '../../src/utils/search.js';

const TMP_DIR = path.join(os.tmpdir(), 'codelab-sage-test-search');

describe('search utils', () => {
  beforeEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
    await fs.mkdir(TMP_DIR, { recursive: true });

    await fs.writeFile(path.join(TMP_DIR, 'greeting.ts'), 'export function hello() {\n  return "hi";\n}\n', 'utf-8');
    await fs.writeFile(
      path.join(TMP_DIR, 'math.ts'),
      'export function add(a: number, b: number) {\n  return a + b;\n}\n',
      'utf-8',
    );
    await fs.mkdir(path.join(TMP_DIR, 'nested'), { recursive: true });
    await fs.writeFile(path.join(TMP_DIR, 'nested', 'deep.txt'), 'deep value\n', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  it('searchCode finds matching content', async () => {
    const result = await searchCode({ query: 'return', cwd: TMP_DIR, maxResults: 10 });
    const files = new Set(result.matches.map((m) => m.file));
    expect(files.has('greeting.ts')).toBe(true);
    expect(files.has('math.ts')).toBe(true);
  });

  it('searchCode supports file patterns', async () => {
    const result = await searchCode({ query: 'return', cwd: TMP_DIR, filePattern: '*.ts' });
    expect(result.matches.every((m) => m.file.endsWith('.ts'))).toBe(true);
  });

  it('searchCode returns context lines around matches', async () => {
    const result = await searchCode({ query: 'hello', cwd: TMP_DIR, contextLines: 1 });
    const match = result.matches.find((m) => m.file === 'greeting.ts');
    expect(match).toBeDefined();
    expect(match!.content).toContain('hello');
  });

  it('searchCode returns empty when no matches', async () => {
    const result = await searchCode({ query: 'zzzzzzzz', cwd: TMP_DIR });
    expect(result.matches).toHaveLength(0);
  });

  it('searchFiles finds matching file names', async () => {
    const result = await searchFiles({ query: 'math', cwd: TMP_DIR });
    expect(result.matches.map((m) => m.file)).toContain('math.ts');
  });

  it('searchFiles returns empty when no matches', async () => {
    const result = await searchFiles({ query: 'zzzzzzzz', cwd: TMP_DIR });
    expect(result.matches).toHaveLength(0);
  });
});
