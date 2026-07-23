import type { Skill } from './skill.js';

export function renderSkills(skills: Skill[]): string {
  if (skills.length === 0) {
    return '';
  }

  const parts = skills.map((skill) => {
    const header = `## Skill: ${skill.name}`;
    const meta = [
      skill.description ? `Description: ${skill.description}` : '',
      skill.version ? `Version: ${skill.version}` : '',
      skill.author ? `Author: ${skill.author}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    return [header, meta ? `_${meta}_` : '', skill.content].filter(Boolean).join('\n');
  });

  return `# Injected Skills\n\n${parts.join('\n\n')}`;
}
