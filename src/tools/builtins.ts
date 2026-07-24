import type { SageConfig } from '../config/schema.js';
import { ToolRegistry } from './registry.js';
import { createReadFileTool } from './definitions/readFile.js';
import { createWriteFileTool } from './definitions/writeFile.js';
import { createBashTool } from './definitions/bash.js';
import { createWeatherTool } from './definitions/weather.js';
import { createSearchCodeTool } from './definitions/searchCode.js';
import { createSearchFilesTool } from './definitions/searchFiles.js';
import { PermissionManager } from '../permissions/manager.js';

export function createBuiltinTools(config: SageConfig, permissionManager?: PermissionManager) {
  return [
    createReadFileTool(config),
    createWriteFileTool(config, permissionManager),
    createBashTool(config, permissionManager),
    createWeatherTool(),
    createSearchCodeTool(),
    createSearchFilesTool(),
  ];
}

export function createToolRegistry(
  config: SageConfig,
  permissionManager?: PermissionManager,
): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll(createBuiltinTools(config, permissionManager));
  return registry;
}
