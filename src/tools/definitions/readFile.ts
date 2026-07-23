import fs from 'fs/promises';
import path from 'path';
import type { SageConfig } from '../../config/schema.js';
import type { Tool } from '../tool.js';
import { CodelabSageError } from '../../utils/errors.js';

const SENSITIVE_PATTERNS = [
  '.env',
  '.env.local',
  '.npmrc',
  '.ssh/id_rsa',
  '.ssh/id_ed25519',
  '.aws/credentials',
  '.git-credentials',
  'token',
  'secret',
  'password',
];

export function createReadFileTool(_config: SageConfig): Tool {
  return {
    name: 'read_file',
    description:
      'Read the content of a file. Use the "limit" parameter to read only the first N lines.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative or absolute path to the file',
        },
        encoding: {
          type: 'string',
          description: 'File encoding',
          default: 'utf-8',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read',
        },
      },
      required: ['path'],
    },
    async execute(args) {
      if (typeof args.path !== 'string') {
        throw new CodelabSageError('Parameter "path" must be a string', 'TOOL_INVALID_ARGUMENT');
      }
      const filePath = path.resolve(args.path);
      const encoding = typeof args.encoding === 'string' ? args.encoding : 'utf-8';
      const limit = typeof args.limit === 'number' ? args.limit : undefined;

      for (const pattern of SENSITIVE_PATTERNS) {
        if (filePath.toLowerCase().includes(pattern)) {
          throw new CodelabSageError(
            `Reading file "${args.path}" is not allowed for security reasons.`,
            'TOOL_SECURITY_BLOCKED',
          );
        }
      }

      let content: string;
      try {
        content = await fs.readFile(filePath, encoding as BufferEncoding);
      } catch (err) {
        throw new CodelabSageError(
          `Failed to read file "${args.path}": ${(err as Error).message}`,
          'TOOL_READ_ERROR',
        );
      }

      if (limit && limit > 0) {
        const lines = content.split(/\r?\n/);
        content = lines.slice(0, limit).join('\n');
        if (lines.length > limit) {
          content += `\n... (${lines.length - limit} more lines)`;
        }
      }

      return content;
    },
  };
}
