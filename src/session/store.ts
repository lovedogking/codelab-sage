import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Session, SessionSummary } from './types.js';

function resolveHome(input: string): string {
  if (input.startsWith('~/') || input === '~') {
    return path.join(os.homedir(), input.slice(1));
  }
  return input;
}

export interface SessionStoreOptions {
  /** Base directory for session files. Defaults to ~/.codelab-sage/sessions */
  dir?: string;
}

export class SessionStore {
  private readonly dir: string;

  constructor(options: SessionStoreOptions = {}) {
    this.dir = options.dir ? resolveHome(options.dir) : resolveHome('~/.codelab-sage/sessions');
  }

  private filePath(id: string): string {
    // Sanitize id to avoid path traversal.
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dir, `${safeId}.json`);
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async list(): Promise<SessionSummary[]> {
    await this.ensureDir();
    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.dir);
    } catch {
      return [];
    }

    const sessions: SessionSummary[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const id = entry.slice(0, -5);
      const session = await this.load(id);
      if (session) {
        sessions.push({
          id: session.id,
          title: session.title,
          cwd: session.cwd,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length,
        });
      }
    }

    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<Session | null> {
    const filePath = this.filePath(id);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      return parsed as Session;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async save(session: Session): Promise<void> {
    await this.ensureDir();
    const filePath = this.filePath(session.id);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  async delete(id: string): Promise<boolean> {
    const filePath = this.filePath(id);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  async exists(id: string): Promise<boolean> {
    const filePath = this.filePath(id);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async fork(id: string, newId: string, newTitle?: string): Promise<Session | null> {
    const session = await this.load(id);
    if (!session) return null;

    const now = new Date().toISOString();
    const forked: Session = {
      ...session,
      id: newId,
      title: newTitle ?? `${session.title} (fork)`,
      createdAt: now,
      updatedAt: now,
    };

    await this.save(forked);
    return forked;
  }
}
