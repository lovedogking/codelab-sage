import type { AgentOptions } from './agent.js';
import { Agent } from './agent.js';
import type { AgentDefinition, AgentRegistry } from './types.js';
import { ToolRegistry } from '../tools/registry.js';
import type { Skill } from '../skills/skill.js';

export interface AgentFactoryOptions {
  /** Base AgentOptions used to create sub-agents (config/logger/provider/activeEntry). */
  baseOptions: AgentOptions;
  /** Full tool registry to filter from. */
  toolRegistry: ToolRegistry;
  /** Full skill list to filter from. */
  skills: Skill[];
  /** Agent definitions registry. */
  agents: AgentRegistry;
}

/**
 * Factory for creating specialized sub-agents based on AgentDefinition.
 */
export class AgentFactory {
  private readonly baseOptions: AgentOptions;
  private readonly toolRegistry: ToolRegistry;
  private readonly skills: Skill[];
  private readonly agents: AgentRegistry;

  constructor(options: AgentFactoryOptions) {
    this.baseOptions = options.baseOptions;
    this.toolRegistry = options.toolRegistry;
    this.skills = options.skills;
    this.agents = options.agents;
  }

  /**
   * Get all available agent definitions.
   */
  getDefinitions(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get a single agent definition by name.
   */
  getDefinition(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  /**
   * Check if an agent exists.
   */
  has(name: string): boolean {
    return this.agents.has(name);
  }

  /**
   * Create a new Agent instance configured for the given agent definition.
   */
  createAgent(name: string): Agent {
    const def = this.agents.get(name);
    if (!def) {
      throw new Error(`Unknown agent: ${name}`);
    }

    const filteredRegistry = this.createFilteredRegistry(def);
    const filteredSkills = this.createFilteredSkills(def);

    return new Agent({
      config: this.baseOptions.config,
      logger: this.baseOptions.logger,
      provider: this.baseOptions.provider,
      registry: filteredRegistry,
      skills: filteredSkills,
      activeEntry: this.baseOptions.activeEntry,
      activeRole: this.baseOptions.activeRole,
      systemPromptOverride: def.systemPrompt,
    });
  }

  private createFilteredRegistry(def: AgentDefinition): ToolRegistry {
    if (!def.toolNames || def.toolNames.length === 0) {
      return this.toolRegistry;
    }

    const allowed = new Set(def.toolNames);
    const filtered = new ToolRegistry();
    for (const tool of this.toolRegistry.list()) {
      if (allowed.has(tool.name)) {
        filtered.register(tool);
      }
    }
    return filtered;
  }

  private createFilteredSkills(def: AgentDefinition): Skill[] {
    if (!def.skillTags || def.skillTags.length === 0) {
      return this.skills;
    }

    const tagSet = new Set(def.skillTags);
    return this.skills.filter((skill) => {
      if (!skill.tags || skill.tags.length === 0) return false;
      return skill.tags.some((tag) => tagSet.has(tag));
    });
  }
}
