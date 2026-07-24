import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadSkills, filterSkillsByRole } from '../../src/skills/loader.js';
import type { Skill } from '../../src/skills/skill.js';

const TMP_DIR = path.join(os.tmpdir(), 'codelab-sage-test-skills');

describe('loadSkills', () => {
  beforeEach(async () => {
    await fs.mkdir(TMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  it('parses skill markdown with frontmatter', async () => {
    const content = `---
name: test-skill
description: A test skill
priority: 50
---

# Test Skill

This is the body.
`;
    await fs.writeFile(path.join(TMP_DIR, 'test.md'), content, 'utf-8');

    const skills = await loadSkills([TMP_DIR]);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('test-skill');
    expect(skills[0].priority).toBe(50);
    expect(skills[0].content).toContain('This is the body.');
  });

  it('sorts skills by priority descending', async () => {
    await fs.writeFile(path.join(TMP_DIR, 'a.md'), '---\nname: a\npriority: 10\n---\nA', 'utf-8');
    await fs.writeFile(path.join(TMP_DIR, 'b.md'), '---\nname: b\npriority: 100\n---\nB', 'utf-8');

    const skills = await loadSkills([TMP_DIR]);
    expect(skills.map((s) => s.name)).toEqual(['b', 'a']);
  });

  it('ignores missing directories', async () => {
    const skills = await loadSkills([path.join(TMP_DIR, 'missing')]);
    expect(skills).toHaveLength(0);
  });

  it('parses role field from frontmatter', async () => {
    const content = `---
name: architect
role: architect
priority: 100
---

# Architect

Think like a software architect.
`;
    await fs.writeFile(path.join(TMP_DIR, 'architect.md'), content, 'utf-8');

    const skills = await loadSkills([TMP_DIR]);
    expect(skills).toHaveLength(1);
    expect(skills[0].role).toBe('architect');
  });
});

describe('filterSkillsByRole', () => {
  const base: Skill = {
    name: 'base',
    content: 'base content',
    filePath: '/tmp/base.md',
    priority: 10,
  };

  const architect: Skill = {
    name: 'architect',
    role: 'architect',
    content: 'architect content',
    filePath: '/tmp/architect.md',
    priority: 20,
  };

  const reviewer: Skill = {
    name: 'reviewer',
    role: 'reviewer',
    content: 'reviewer content',
    filePath: '/tmp/reviewer.md',
    priority: 30,
  };

  it('returns all skills when no role is set', () => {
    const skills = filterSkillsByRole([base, architect, reviewer], undefined);
    expect(skills.map((s) => s.name)).toEqual(['base', 'architect', 'reviewer']);
  });

  it('keeps base skills and matching role skills', () => {
    const skills = filterSkillsByRole([base, architect, reviewer], 'architect');
    expect(skills.map((s) => s.name)).toEqual(['base', 'architect']);
  });

  it('returns only base skills when role has no matches', () => {
    const skills = filterSkillsByRole([base, architect, reviewer], 'unknown');
    expect(skills.map((s) => s.name)).toEqual(['base']);
  });
});
