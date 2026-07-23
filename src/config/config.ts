import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { type SageConfig, sageConfigSchema } from './schema.js';
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
    history: { ...base.history, ...override.history },
    tools: {
      bash: { ...base.tools?.bash, ...override.tools?.bash },
    },
  };
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
  config = mergeConfig(config, cliConfig);

  // Resolve skill dirs
  config.skillDirs = resolveSkillDirs(config.skillDirs);

  return config;
}
