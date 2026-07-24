import path from 'path';
import type { SageConfig } from '../config/schema.js';

export interface PermissionContext {
  /** Tool name, e.g. "bash" or "write_file". */
  toolName: string;
  /** Whether the operation is considered destructive. */
  destructive: boolean;
  /** Absolute path affected by the operation, if any. */
  targetPath?: string;
}

export type ConfirmHandler = (message: string, defaultValue?: boolean) => Promise<boolean>;

export class PermissionManager {
  private readonly config: SageConfig;
  private yoloMode: boolean;
  private confirmHandler?: ConfirmHandler;

  constructor(config: SageConfig) {
    this.config = config;
    this.yoloMode = config.yolo ?? false;
  }

  get isYolo(): boolean {
    return this.yoloMode;
  }

  setYolo(value: boolean): void {
    this.yoloMode = value;
  }

  /**
   * Inject a UI-specific confirmation handler. The handler is called by tools
   * when they need explicit user approval. This avoids coupling tools to a
   * specific input library (e.g. @inquirer/prompts vs blessed).
   */
  setConfirmHandler(handler: ConfirmHandler): void {
    this.confirmHandler = handler;
  }

  /**
   * Ask the user for confirmation. Falls back to `false` if no handler is set.
   */
  async confirm(message: string, defaultValue = false): Promise<boolean> {
    if (this.confirmHandler) {
      return this.confirmHandler(message, defaultValue);
    }
    return defaultValue;
  }

  /**
   * Decide whether a tool operation should require explicit confirmation.
   * YOLO mode skips every confirmation.
   */
  shouldConfirm(context: PermissionContext): boolean {
    if (this.yoloMode) return false;

    const toolConfig = this.config.tools?.[context.toolName as keyof typeof this.config.tools];
    if (toolConfig && 'requireConfirm' in toolConfig) {
      if (toolConfig.requireConfirm === false) return false;
      if (toolConfig.requireConfirm === true) return context.destructive;
    }

    if (!context.destructive) return false;

    // Destructive operations outside the current working directory always confirm.
    if (context.targetPath && !this.isUnderCwd(context.targetPath)) {
      return true;
    }

    return context.destructive;
  }

  private isUnderCwd(targetPath: string): boolean {
    const cwd = process.cwd();
    const relative = path.relative(cwd, targetPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }
}
