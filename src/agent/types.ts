import type { Message } from '../types/index.js';

/**
 * Definition of a specialized sub-agent.
 * Built-in agents are defined as TS objects; user-defined agents can later be
 * loaded from YAML files.
 */
export interface AgentDefinition {
  /** Unique agent identifier, e.g. "coder". */
  name: string;
  /** Short human-readable description. */
  description: string;
  /** Additional system prompt rules injected after the base prompt. */
  systemPrompt: string;
  /** If provided, only these tools are available to the agent. */
  toolNames?: string[];
  /** If provided, only skills with matching tags are injected. */
  skillTags?: string[];
  /** Number of parent messages to inherit as context. Default 5. */
  inheritParentMessages?: number;
}

/**
 * Context passed from a parent agent to a sub-agent.
 */
export interface AgentContext {
  /** Recent messages from the parent conversation. */
  parentMessages?: Message[];
  /** Current working directory. */
  cwd: string;
}

/**
 * Registry of available agent definitions.
 */
export type AgentRegistry = Map<string, AgentDefinition>;
