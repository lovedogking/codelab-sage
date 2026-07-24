import { describe, it, expect } from 'vitest';
import { PermissionManager } from '../../src/permissions/manager.js';
import type { SageConfig } from '../../src/config/schema.js';

const BASE_CONFIG: SageConfig = {
  confirmDestructive: true,
  tools: {
    bash: { requireConfirm: true },
    write_file: { requireConfirm: true },
  },
};

describe('PermissionManager', () => {
  it('requires confirmation for destructive operations by default', () => {
    const manager = new PermissionManager(BASE_CONFIG);
    expect(manager.shouldConfirm({ toolName: 'write_file', destructive: true, targetPath: '/tmp/file' })).toBe(true);
  });

  it('skips confirmation for non-destructive operations', () => {
    const manager = new PermissionManager(BASE_CONFIG);
    expect(manager.shouldConfirm({ toolName: 'write_file', destructive: false })).toBe(false);
  });

  it('YOLO mode skips all confirmations', () => {
    const manager = new PermissionManager({ ...BASE_CONFIG, yolo: true });
    expect(manager.shouldConfirm({ toolName: 'bash', destructive: true })).toBe(false);
    expect(manager.shouldConfirm({ toolName: 'write_file', destructive: true, targetPath: '/tmp/file' })).toBe(false);
  });

  it('can toggle YOLO mode at runtime', () => {
    const manager = new PermissionManager(BASE_CONFIG);
    expect(manager.isYolo).toBe(false);

    manager.setYolo(true);
    expect(manager.isYolo).toBe(true);
    expect(manager.shouldConfirm({ toolName: 'bash', destructive: true })).toBe(false);
  });

  it('requires confirmation for operations outside cwd when destructive', () => {
    const manager = new PermissionManager(BASE_CONFIG);
    expect(manager.shouldConfirm({ toolName: 'write_file', destructive: true, targetPath: '/outside/file' })).toBe(true);
  });
});
