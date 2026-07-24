import type { SageConfig } from './schema.js';

export const defaultConfig: SageConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  skillDirs: ['~/.codelab-sage/skills'],
  logLevel: 'info',
  confirmDestructive: true,
  history: {
    enabled: false,
    maxDays: 30,
  },
  tools: {
    bash: {
      timeout: 30000,
      requireConfirm: true,
    },
  },
  providers: [],
  activeProvider: '',
  activeRole: undefined,
  activeAgent: undefined,
  yolo: false,
  contextLimit: 128000,
};
