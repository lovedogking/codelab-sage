import type { Agent } from '../agent/agent.js';
import type { SageConfig } from '../config/schema.js';
import type { Session, SessionSummary } from './types.js';
import { SessionStore } from './store.js';

export interface SessionManagerOptions {
  config: SageConfig;
  store?: SessionStore;
}

function generateId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 6);
  return `${date}-${random}`;
}

function generateTitle(): string {
  return `Session ${new Date().toLocaleString()}`;
}

export class SessionManager {
  private readonly store: SessionStore;
  private readonly config: SageConfig;
  private currentSessionId?: string;

  constructor(options: SessionManagerOptions) {
    this.config = options.config;
    this.store = options.store ?? new SessionStore();
  }

  get currentId(): string | undefined {
    return this.currentSessionId;
  }

  async list(): Promise<SessionSummary[]> {
    return this.store.list();
  }

  async create(agent: Agent, title?: string): Promise<Session> {
    const session: Session = {
      id: generateId(),
      title: title ?? generateTitle(),
      cwd: process.cwd(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: agent.exportMessages(),
      activeProvider: this.config.activeProvider ?? agent.currentEntry?.id,
      activeRole: agent.currentRole,
      activeAgent: this.config.activeAgent,
    };

    await this.store.save(session);
    this.currentSessionId = session.id;
    return session;
  }

  async save(agent: Agent, title?: string): Promise<Session> {
    if (this.currentSessionId) {
      const existing = await this.store.load(this.currentSessionId);
      if (existing) {
        existing.title = title ?? existing.title;
        existing.updatedAt = new Date().toISOString();
        existing.messages = agent.exportMessages();
        existing.cwd = process.cwd();
        existing.activeProvider = this.config.activeProvider ?? agent.currentEntry?.id;
        existing.activeRole = agent.currentRole;
        existing.activeAgent = this.config.activeAgent;
        await this.store.save(existing);
        return existing;
      }
    }

    return this.create(agent, title);
  }

  async load(id: string, agent: Agent): Promise<Session | null> {
    const session = await this.store.load(id);
    if (!session) return null;

    agent.importMessages(session.messages);
    this.currentSessionId = session.id;
    return session;
  }

  async fork(id: string, agent: Agent, newTitle?: string): Promise<Session | null> {
    const source = await this.store.load(id);
    if (!source) return null;

    const newId = generateId();
    const forked = await this.store.fork(id, newId, newTitle);
    if (!forked) return null;

    agent.importMessages(forked.messages);
    this.currentSessionId = forked.id;
    return forked;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.store.delete(id);
    if (this.currentSessionId === id) {
      this.currentSessionId = undefined;
    }
    return result;
  }

  async saveCurrent(agent: Agent): Promise<void> {
    if (this.currentSessionId) {
      await this.save(agent);
    }
  }
}
