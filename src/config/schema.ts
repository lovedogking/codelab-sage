import { z } from 'zod';

export const logLevelSchema = z.enum(['silent', 'error', 'warn', 'info', 'verbose', 'debug']);

export const bashToolConfigSchema = z.object({
  allowedCommands: z.array(z.string()).optional(),
  blockedCommands: z.array(z.string()).optional(),
  timeout: z.number().int().min(100).optional(),
  requireConfirm: z.boolean().optional(),
});

export const toolConfigSchema = z.object({
  bash: bashToolConfigSchema.optional(),
});

export const historyConfigSchema = z.object({
  enabled: z.boolean().optional(),
  maxDays: z.number().int().min(1).optional(),
});

export const sageConfigSchema = z.object({
  provider: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  baseURL: z.string().optional(),
  skillDirs: z.array(z.string()).optional(),
  logLevel: logLevelSchema.optional(),
  confirmDestructive: z.boolean().optional(),
  history: historyConfigSchema.optional(),
  tools: toolConfigSchema.optional(),
});

export type SageConfig = z.infer<typeof sageConfigSchema>;
