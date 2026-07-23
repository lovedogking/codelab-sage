import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadSkills } from '../../src/skills/loader.js';

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
});
