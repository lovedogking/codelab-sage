import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Skill } from '../skills/skill.js';
import { renderSkills } from '../skills/renderer.js';
import type { ToolDefinition } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildSystemPrompt(
  skills: Skill[],
  toolDefinitions: ToolDefinition[],
): Promise<string> {
  const baseTemplate = await fs.readFile(
    path.join(__dirname, '..', 'prompts', 'system.txt'),
    'utf-8',
  );

  const skillSection = renderSkills(skills);

  const toolSection = toolDefinitions.length
    ? `\n# Available Tools\n\n${toolDefinitions
        .map((tool) => `- ${tool.name}: ${tool.description}`)
        .join('\n')}`
    : '';

  return [baseTemplate.trim(), skillSection, toolSection].filter(Boolean).join('\n\n');
}
