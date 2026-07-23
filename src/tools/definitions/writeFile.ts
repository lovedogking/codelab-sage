import fs from 'fs/promises';
import path from 'path';
import { confirm } from '@inquirer/prompts';
import type { SageConfig } from '../../config/schema.js';
import type { Tool } from '../tool.js';
import { CodelabSageError } from '../../utils/errors.js';

export function createWriteFileTool(config: SageConfig): Tool {
  return {
    name: 'write_file',
    description:
      'Write content to a file. If the file already exists and "append" is false, a confirmation is required unless explicitly disabled.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative or absolute path to the file',
        },
        content: {
          type: 'string',
          description: 'Content to write',
        },
        append: {
          type: 'boolean',
          description: 'Append to the file instead of overwriting',
          default: false,
        },
      },
      required: ['path', 'content'],
    },
    async execute(args) {
      if (typeof args.path !== 'string') {
        throw new CodelabSageError('Parameter "path" must be a string', 'TOOL_INVALID_ARGUMENT');
      }
      if (typeof args.content !== 'string') {
        throw new CodelabSageError('Parameter "content" must be a string', 'TOOL_INVALID_ARGUMENT');
      }

      const filePath = path.resolve(args.path);
      const append = args.append === true;

      let exists = false;
      try {
        await fs.access(filePath);
        exists = true;
      } catch {
        exists = false;
      }

      if (exists && !append && config.confirmDestructive !== false) {
        const answer = await confirm({
          message: `File "${args.path}" already exists. Overwrite?`,
          default: false,
        });
        if (!answer) {
          throw new CodelabSageError('User declined to overwrite file', 'TOOL_USER_DECLINED');
        }
      }

      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        if (append) {
          await fs.appendFile(filePath, args.content, 'utf-8');
        } else {
          await fs.writeFile(filePath, args.content, 'utf-8');
        }
      } catch (err) {
        throw new CodelabSageError(
          `Failed to write file "${args.path}": ${(err as Error).message}`,
          'TOOL_WRITE_ERROR',
        );
      }

      return append
        ? `Appended to "${args.path}" successfully.`
        : `Wrote "${args.path}" successfully.`;
    },
  };
}
