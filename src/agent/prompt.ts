import type { Skill } from '../skills/skill.js';
import { renderSkills } from '../skills/renderer.js';
import type { ToolDefinition } from '../types/index.js';

const BASE_SYSTEM_PROMPT = `You are codelab-sage, a terminal CLI agent distilled from the wisdom of Codelab.

Your job is to help the user complete software engineering tasks by reasoning step by step and using the available tools when necessary.

General rules:
- Reply in Chinese by default, unless the user asks for another language.
- Prefer calling tools over guessing when concrete information is needed (file contents, command output, external data).
- When a tool call fails, analyze the error and decide whether to retry, use a different tool, or ask the user for clarification.
- Do not execute destructive actions (overwriting files, running shell commands) without explicit confirmation from the user, unless confirmation is disabled.
- Do not reveal API keys, passwords, or other secrets in your replies.
- Keep your internal reasoning concise; only output information useful to the user.

Available tools will be described in the following messages or function definitions.`;

export function buildSystemPrompt(
  skills: Skill[],
  toolDefinitions: ToolDefinition[],
): string {
  const skillSection = renderSkills(skills);

  const toolSection = toolDefinitions.length
    ? `\n# Available Tools\n\n${toolDefinitions
        .map((tool) => `- ${tool.name}: ${tool.description}`)
        .join('\n')}`
    : '';

  return [BASE_SYSTEM_PROMPT, skillSection, toolSection].filter(Boolean).join('\n\n');
}
