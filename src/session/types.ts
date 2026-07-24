import type { Message } from '../types/index.js';

export interface Session {
  /** Unique session identifier (URL-safe slug). */
  id: string;
  /** Human-readable title. */
  title: string;
  /** Project/working directory the session belongs to. */
  cwd: string;
  /** Creation timestamp (ISO 8601). */
  createdAt: string;
  /** Last update timestamp (ISO 8601). */
  updatedAt: string;
  /** Conversation messages (includes system prompt). */
  messages: Message[];
  /** Provider active when the session was saved. */
  activeProvider?: string;
  /** Role active when the session was saved. */
  activeRole?: string;
  /** Agent active when the session was saved. */
  activeAgent?: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}
