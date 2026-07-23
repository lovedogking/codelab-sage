import type { SageConfig } from '../config/schema.js';
import { ToolRegistry } from './registry.js';
import { createReadFileTool } from './definitions/readFile.js';
import { createWriteFileTool } from './definitions/writeFile.js';
import { createBashTool } from './definitions/bash.js';
import { createWeatherTool } from './definitions/weather.js';

export function createBuiltinTools(config: SageConfig) {
  return [
    createReadFileTool(config),
    createWriteFileTool(config),
    createBashTool(config),
    createWeatherTool(),
  ];
}

export function createToolRegistry(config: SageConfig): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll(createBuiltinTools(config));
  return registry;
}
