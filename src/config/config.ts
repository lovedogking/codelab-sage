import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { type SageConfig, type ProviderEntry, sageConfigSchema } from './schema.js';
import { defaultConfig } from './defaults.js';
import { CodelabSageError } from '../utils/errors.js';

dotenv.config();

export interface CliOptions {
  model?: string;
  skillDir?: string[];
  config?: string;
  verbose?: boolean;
  noConfirm?: boolean;
  apiKey?: string;
  repl?: boolean;
  role?: string;
  simple?: boolean;
  agent?: string;
  yolo?: boolean;
}

function resolveHome(input: string): string {
  if (input.startsWith('~/') || input === '~') {
    return path.join(os.homedir(), input.slice(1));
  }
  return input;
}

function resolveSkillDirs(dirs?: string[]): string[] | undefined {
  if (!dirs) return undefined;
  return dirs.map(resolveHome);
}

async function loadJsonConfig(filePath: string): Promise<SageConfig> {
  const resolved = resolveHome(filePath);
  try {
    const content = await fs.readFile(resolved, 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    return sageConfigSchema.parse(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw new CodelabSageError(
      `Failed to load config from ${resolved}: ${(err as Error).message}`,
      'CONFIG_LOAD_ERROR',
      { cause: err },
    );
  }
}

function mergeConfig(base: SageConfig, override: SageConfig): SageConfig {
  return {
    ...base,
    ...override,
    skillDirs: override.skillDirs ?? base.skillDirs,
    providers: override.providers ?? base.providers,
    activeProvider: override.activeProvider ?? base.activeProvider,
    activeRole: override.activeRole ?? base.activeRole,
    activeAgent: override.activeAgent ?? base.activeAgent,
    yolo: override.yolo ?? base.yolo,
    mcpServers: override.mcpServers ?? base.mcpServers,
    history: { ...base.history, ...override.history },
    tools: {
      bash: { ...base.tools?.bash, ...override.tools?.bash },
    },
  };
}

/**
 * Backward compat: if the merged config has old-style apiKey/model but
 * no providers array, auto-provision a default "default" provider entry.
 */
function normalizeConfig(config: SageConfig): SageConfig {
  if (config.providers && config.providers.length > 0) {
    return config;
  }

  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return config;
  }

  const entry: ProviderEntry = {
    id: 'default',
    provider: config.provider ?? 'openai',
    apiKey,
    baseURL: config.baseURL ?? process.env.OPENAI_BASE_URL,
    model: config.model ?? 'gpt-4o-mini',
  };

  return {
    ...config,
    providers: [entry],
    activeProvider: config.activeProvider || 'default',
  };
}

/**
 * Get the active ProviderEntry from config.
 * Returns undefined if no provider is configured.
 */
export function getActiveProvider(config: SageConfig): ProviderEntry | undefined {
  const providers = config.providers ?? [];
  const activeId = config.activeProvider;

  if (activeId) {
    return providers.find((p) => p.id === activeId);
  }

  return providers[0];
}

/**
 * Persist config to the user config file.
 */
export async function saveConfig(config: SageConfig, filePath?: string): Promise<void> {
  const target = resolveHome(filePath ?? '~/.codelab-sage/config.json');
  const dir = path.dirname(target);

  await fs.mkdir(dir, { recursive: true });

  // Only persist the user-facing fields
  const toSave: Record<string, unknown> = {};
  if (config.providers) toSave.providers = config.providers;
  if (config.activeProvider) toSave.activeProvider = config.activeProvider;
  if (config.activeRole) toSave.activeRole = config.activeRole;
  if (config.activeAgent) toSave.activeAgent = config.activeAgent;
  if (config.yolo !== undefined) toSave.yolo = config.yolo;
  if (config.mcpServers) toSave.mcpServers = config.mcpServers;
  if (config.model) toSave.model = config.model;
  if (config.skillDirs) toSave.skillDirs = config.skillDirs;
  if (config.logLevel) toSave.logLevel = config.logLevel;
  if (config.confirmDestructive !== undefined) toSave.confirmDestructive = config.confirmDestructive;
  if (config.history) toSave.history = config.history;
  if (config.tools) toSave.tools = config.tools;

  await fs.writeFile(target, JSON.stringify(toSave, null, 2), 'utf-8');
}

export async function loadConfig(cliOptions: CliOptions = {}): Promise<SageConfig> {
  let config: SageConfig = { ...defaultConfig };

  // 1. User config
  const userConfigPath = cliOptions.config ?? '~/.codelab-sage/config.json';
  const userConfig = await loadJsonConfig(userConfigPath);
  config = mergeConfig(config, userConfig);

  // 2. Project config
  const projectConfig = await loadJsonConfig('./.codelab-sage.json');
  config = mergeConfig(config, projectConfig);

  // 3. Environment variables
  const envConfig: SageConfig = {};
  if (process.env.OPENAI_API_KEY) envConfig.apiKey = process.env.OPENAI_API_KEY;
  if (process.env.OPENAI_BASE_URL) envConfig.baseURL = process.env.OPENAI_BASE_URL;
  if (process.env.CODELAB_SAGE_MODEL) envConfig.model = process.env.CODELAB_SAGE_MODEL;
  if (process.env.CODELAB_SAGE_LOG_LEVEL) {
    envConfig.logLevel = process.env.CODELAB_SAGE_LOG_LEVEL as SageConfig['logLevel'];
  }
  if (process.env.CODELAB_SAGE_SKILL_DIRS) {
    envConfig.skillDirs = process.env.CODELAB_SAGE_SKILL_DIRS.split(',').map((s) => s.trim());
  }
  config = mergeConfig(config, sageConfigSchema.parse(envConfig));

  // 4. CLI options
  const cliConfig: SageConfig = {};
  if (cliOptions.model) cliConfig.model = cliOptions.model;
  if (cliOptions.apiKey) cliConfig.apiKey = cliOptions.apiKey;
  if (cliOptions.skillDir && cliOptions.skillDir.length > 0) {
    cliConfig.skillDirs = cliOptions.skillDir;
  }
  if (cliOptions.noConfirm !== undefined) cliConfig.confirmDestructive = !cliOptions.noConfirm;
  if (cliOptions.verbose) cliConfig.logLevel = 'verbose';
  if (cliOptions.role) cliConfig.activeRole = cliOptions.role;
  if (cliOptions.agent) cliConfig.activeAgent = cliOptions.agent;
  if (cliOptions.yolo !== undefined) cliConfig.yolo = cliOptions.yolo;
  config = mergeConfig(config, cliConfig);

  // Resolve skill dirs
  config.skillDirs = resolveSkillDirs(config.skillDirs);

  // Normalize: backward-compat old config format → providers array
  config = normalizeConfig(config);

  return config;
}
