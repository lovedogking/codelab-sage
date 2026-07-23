import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import type { Skill } from './skill.js';
import { skillManifestSchema } from './skill.js';
import { CodelabSageError } from '../utils/errors.js';

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

async function loadSkillFile(filePath: string): Promise<Skill | null> {
  const content = await fs.readFile(filePath, 'utf-8');
  const match = FRONTMATTER_REGEX.exec(content);

  if (!match) {
    return null;
  }

  const rawFrontmatter = match[1];
  const body = match[2].trim();

  let manifest: unknown;
  try {
    manifest = YAML.parse(rawFrontmatter);
  } catch (err) {
    throw new CodelabSageError(
      `Invalid YAML frontmatter in ${filePath}: ${(err as Error).message}`,
      'SKILL_PARSE_ERROR',
    );
  }

  const parsed = skillManifestSchema.parse(manifest);

  return {
    ...parsed,
    content: body,
    filePath,
  };
}

export async function loadSkills(skillDirs: string[]): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const dir of skillDirs) {
    const resolved = path.resolve(dir);
    let entries: string[] = [];
    try {
      entries = await fs.readdir(resolved);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        continue;
      }
      throw new CodelabSageError(
        `Failed to read skill directory ${resolved}: ${(err as Error).message}`,
        'SKILL_LOAD_ERROR',
      );
    }

    const markdownFiles = entries
      .filter((name) => name.endsWith('.md'))
      .map((name) => path.join(resolved, name));

    for (const filePath of markdownFiles) {
      try {
        const skill = await loadSkillFile(filePath);
        if (skill) {
          skills.push(skill);
        }
      } catch (err) {
        if (err instanceof CodelabSageError) throw err;
        throw new CodelabSageError(
          `Failed to load skill ${filePath}: ${(err as Error).message}`,
          'SKILL_LOAD_ERROR',
        );
      }
    }
  }

  return skills.sort((a, b) => b.priority - a.priority);
}
