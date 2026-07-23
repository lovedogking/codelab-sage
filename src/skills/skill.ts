import { z } from 'zod';

export const skillManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  priority: z.number().int().default(0),
});

export type SkillManifest = z.infer<typeof skillManifestSchema>;

export interface Skill extends SkillManifest {
  content: string;
  filePath: string;
}
