import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

export interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

export interface SearchResult {
  matches: SearchMatch[];
}

export interface SearchCodeOptions {
  query: string;
  cwd?: string;
  path?: string;
  filePattern?: string;
  caseSensitive?: boolean;
  contextLines?: number;
  maxResults?: number;
}

export interface SearchFilesOptions {
  query: string;
  cwd?: string;
  path?: string;
  maxResults?: number;
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.venv',
  '__pycache__',
]);

function shouldIgnoreDir(name: string): boolean {
  return IGNORED_DIRS.has(name) || name.startsWith('.');
}

async function hasRipgrep(): Promise<boolean> {
  try {
    await execFileAsync('rg', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Search file contents.
 */
export async function searchCode(options: SearchCodeOptions): Promise<SearchResult> {
  const rg = await hasRipgrep();
  if (rg) {
    return searchCodeRg(options);
  }
  return searchCodeNode(options);
}

/**
 * Search file names.
 */
export async function searchFiles(options: SearchFilesOptions): Promise<SearchResult> {
  const rg = await hasRipgrep();
  if (rg) {
    return searchFilesRg(options);
  }
  return searchFilesNode(options);
}

// ------------------------------------------------------------------
// ripgrep implementations
// ------------------------------------------------------------------

async function searchCodeRg(options: SearchCodeOptions): Promise<SearchResult> {
  const cwd = options.cwd ?? process.cwd();
  const target = options.path ? path.resolve(cwd, options.path) : cwd;
  const maxResults = options.maxResults ?? 50;
  const contextLines = options.contextLines ?? 2;

  const args = [
    '--json',
    '--context',
    String(contextLines),
    '--max-count',
    String(Math.ceil(maxResults / 10)),
    '--max-filesize',
    '1M',
    '--glob',
    '!.git/',
    '--glob',
    '!node_modules/',
    '--glob',
    '!dist/',
    '--glob',
    '!build/',
  ];

  if (!options.caseSensitive) {
    args.push('--ignore-case');
  }
  if (options.filePattern) {
    args.push('--glob', options.filePattern);
  }

  args.push(options.query, target);

  try {
    const { stdout } = await execFileAsync('rg', args, { cwd });
    return parseRgJson(stdout, maxResults, cwd);
  } catch (err) {
    const code = (err as { code?: number | string }).code;
    if (code === 1 || code === '1') {
      // ripgrep returns 1 when no matches found.
      return { matches: [] };
    }
    throw err;
  }
}

async function searchFilesRg(options: SearchFilesOptions): Promise<SearchResult> {
  const cwd = options.cwd ?? process.cwd();
  const target = options.path ? path.resolve(cwd, options.path) : cwd;
  const maxResults = options.maxResults ?? 50;

  const args = [
    '--files',
    '--glob',
    '!.git/',
    '--glob',
    '!node_modules/',
    '--glob',
    '!dist/',
    '--glob',
    '!build/',
    target,
  ];

  try {
    const { stdout } = await execFileAsync('rg', args, { cwd });
    const lines = stdout.split('\n').filter((line) => line.length > 0);
    const lowerQuery = options.query.toLowerCase();
    const matches = lines
      .filter((file) => path.basename(file).toLowerCase().includes(lowerQuery))
      .slice(0, maxResults)
      .map((file) => ({
        file: path.relative(cwd, file),
        line: 1,
        content: path.basename(file),
      }));
    return { matches };
  } catch {
    return { matches: [] };
  }
}

function parseRgJson(output: string, maxResults: number, cwd: string): SearchResult {
  const matches: SearchMatch[] = [];
  const lines = output.split('\n').filter((line) => line.length > 0);

  for (const line of lines) {
    if (matches.length >= maxResults) break;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type === 'match') {
        const data = event.data as Record<string, unknown>;
        const pathData = data.path as Record<string, unknown>;
        const file = pathData.text as string;
        const lineNumber = (data.line_number as number) ?? 0;
        const linesData = data.lines as Record<string, unknown>;
        const text = linesData.text as string;
        matches.push({ file: path.relative(cwd, file), line: lineNumber, content: text });
      }
    } catch {
      // Ignore malformed JSON lines.
    }
  }

  return { matches };
}

// ------------------------------------------------------------------
// Node.js fallback implementations
// ------------------------------------------------------------------

async function searchCodeNode(options: SearchCodeOptions): Promise<SearchResult> {
  const cwd = options.cwd ?? process.cwd();
  const target = options.path ? path.resolve(cwd, options.path) : cwd;
  const maxResults = options.maxResults ?? 50;
  const contextLines = options.contextLines ?? 2;

  const matches: SearchMatch[] = [];
  await walk(target, async (filePath) => {
    if (matches.length >= maxResults) return;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const flags = options.caseSensitive ? undefined : 'i';
      const regex = new RegExp(escapeRegex(options.query), flags);

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          const start = Math.max(0, i - contextLines);
          const end = Math.min(lines.length, i + contextLines + 1);
          const snippet = lines
            .slice(start, end)
            .map((l, idx) => `${start + idx + 1}: ${l}`)
            .join('\n');
          matches.push({
            file: path.relative(cwd, filePath),
            line: i + 1,
            content: snippet,
          });
          if (matches.length >= maxResults) return;
        }
      }
    } catch {
      // Ignore unreadable files.
    }
  });

  return { matches };
}

async function searchFilesNode(options: SearchFilesOptions): Promise<SearchResult> {
  const cwd = options.cwd ?? process.cwd();
  const target = options.path ? path.resolve(cwd, options.path) : cwd;
  const maxResults = options.maxResults ?? 50;
  const lowerQuery = options.query.toLowerCase();

  const matches: SearchMatch[] = [];
  await walk(target, (filePath) => {
    if (matches.length >= maxResults) return;
    const basename = path.basename(filePath).toLowerCase();
    if (basename.includes(lowerQuery)) {
      matches.push({
        file: path.relative(cwd, filePath),
        line: 1,
        content: path.basename(filePath),
      });
    }
  });

  return { matches };
}

async function walk(dir: string, callback: (filePath: string) => void | Promise<void>): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (shouldIgnoreDir(entry)) continue;
    const fullPath = path.join(dir, entry);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await walk(fullPath, callback);
      } else if (stat.isFile()) {
        await callback(fullPath);
      }
    } catch {
      // Ignore inaccessible entries.
    }
  }
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
