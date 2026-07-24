import { z } from 'zod';

export const logLevelSchema = z.enum(['silent', 'error', 'warn', 'info', 'verbose', 'debug']);

export const bashToolConfigSchema = z.object({
  allowedCommands: z.array(z.string()).optional(),
  blockedCommands: z.array(z.string()).optional(),
  timeout: z.number().int().min(100).optional(),
  requireConfirm: z.boolean().optional(),
});

export const writeFileToolConfigSchema = z.object({
  requireConfirm: z.boolean().optional(),
});

export const toolConfigSchema = z.object({
  bash: bashToolConfigSchema.optional(),
  write_file: writeFileToolConfigSchema.optional(),
});

export const historyConfigSchema = z.object({
  enabled: z.boolean().optional(),
  maxDays: z.number().int().min(1).optional(),
});

export const providerEntrySchema = z.object({
  id: z.string().min(1),
  provider: z.string(),
  apiKey: z.string().min(1),
  baseURL: z.string().optional(),
  model: z.string().min(1),
});

export type ProviderEntry = z.infer<typeof providerEntrySchema>;

export const mcpServerSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

export type McpServerConfig = z.infer<typeof mcpServerSchema>;

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
  providers: z.array(providerEntrySchema).optional(),
  activeProvider: z.string().optional(),
  activeRole: z.string().optional(),
  activeAgent: z.string().optional(),
  yolo: z.boolean().optional(),
  mcpServers: z.array(mcpServerSchema).optional(),
  contextLimit: z.number().int().min(1).optional(),
});

export type SageConfig = z.infer<typeof sageConfigSchema>;
