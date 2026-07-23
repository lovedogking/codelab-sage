import { spawn } from 'child_process';
import path from 'path';
import { confirm } from '@inquirer/prompts';
import type { SageConfig } from '../../config/schema.js';
import type { Tool } from '../tool.js';
import { CodelabSageError } from '../../utils/errors.js';

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  />\s*\/dev\//,
  />\s*\/etc\/passwd/,
  /:\(\)\{\s*:\|:&/,
];

export function createBashTool(config: SageConfig): Tool {
  const bashConfig = config.tools?.bash;
  const timeout = bashConfig?.timeout ?? 30000;
  const requireConfirm = bashConfig?.requireConfirm ?? true;
  const allowedCommands = bashConfig?.allowedCommands;
  const blockedCommands = bashConfig?.blockedCommands ?? [];

  return {
    name: 'bash',
    description:
      'Execute a shell command. Use with caution: destructive or system-level commands may be blocked or require confirmation.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command',
        },
        timeout: {
          type: 'number',
          description: `Timeout in milliseconds (default: ${timeout})`,
        },
      },
      required: ['command'],
    },
    async execute(args) {
      if (typeof args.command !== 'string') {
        throw new CodelabSageError('Parameter "command" must be a string', 'TOOL_INVALID_ARGUMENT');
      }
      const command = args.command;
      const cwd = typeof args.cwd === 'string' ? path.resolve(args.cwd) : process.cwd();
      const commandTimeout = typeof args.timeout === 'number' ? args.timeout : timeout;

      for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(command)) {
          throw new CodelabSageError(
            `Command matches a blocked pattern and will not be executed: ${command}`,
            'TOOL_SECURITY_BLOCKED',
          );
        }
      }

      for (const blocked of blockedCommands) {
        if (command.includes(blocked)) {
          throw new CodelabSageError(
            `Command contains blocked fragment "${blocked}"`,
            'TOOL_SECURITY_BLOCKED',
          );
        }
      }

      if (allowedCommands && allowedCommands.length > 0) {
        const firstToken = command.trim().split(/\s+/)[0];
        if (!allowedCommands.includes(firstToken)) {
          throw new CodelabSageError(
            `Command "${firstToken}" is not in the allowed command list.`,
            'TOOL_NOT_ALLOWED',
          );
        }
      }

      if (requireConfirm) {
        const answer = await confirm({
          message: `Execute command: ${command}`,
          default: false,
        });
        if (!answer) {
          throw new CodelabSageError('User declined to execute command', 'TOOL_USER_DECLINED');
        }
      }

      return new Promise((resolve, reject) => {
        const child = spawn('bash', ['-c', command], {
          cwd,
          env: process.env,
        });

        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = setTimeout(() => {
          killed = true;
          child.kill('SIGTERM');
          reject(
            new CodelabSageError(`Command timed out after ${commandTimeout}ms`, 'TOOL_TIMEOUT'),
          );
        }, commandTimeout);

        child.stdout.on('data', (data: Buffer) => {
          stdout += data.toString('utf-8');
        });

        child.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf-8');
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          reject(new CodelabSageError(`Failed to run command: ${err.message}`, 'TOOL_EXEC_ERROR'));
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          if (killed) return;

          const output = [stdout, stderr ? `STDERR:\n${stderr}` : ''].filter(Boolean).join('\n');

          if (code !== 0) {
            reject(
              new CodelabSageError(
                `Command exited with code ${code ?? 'unknown'}\n${output}`,
                'TOOL_COMMAND_ERROR',
              ),
            );
          } else {
            resolve(output || '(command produced no output)');
          }
        });
      });
    },
  };
}
