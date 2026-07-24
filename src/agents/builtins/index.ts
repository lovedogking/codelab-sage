import type { AgentRegistry, AgentDefinition } from '../../agent/types.js';
import { CODER_AGENT } from './coder.js';
import { EXPLORE_AGENT } from './explore.js';
import { PLAN_AGENT } from './plan.js';

export * from './coder.js';
export * from './explore.js';
export * from './plan.js';

export function createBuiltinAgentRegistry(): AgentRegistry {
  const registry = new Map<string, AgentDefinition>();
  registry.set(CODER_AGENT.name, CODER_AGENT);
  registry.set(EXPLORE_AGENT.name, EXPLORE_AGENT);
  registry.set(PLAN_AGENT.name, PLAN_AGENT);
  return registry;
}
