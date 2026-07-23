import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import type { Agent } from '../agent/agent.js';
import type { Logger } from '../utils/logger.js';

export async function startRepl(agent: Agent, logger: Logger): Promise<void> {
  console.log(
    chalk.cyan('🧙 Welcome to codelab-sage REPL. Type /help for commands, /exit to quit.\n'),
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const line = await input({ message: chalk.cyan('sage>') });
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (trimmed === '/exit') {
      console.log(chalk.cyan('Goodbye!'));
      break;
    }

    if (trimmed === '/clear') {
      // Re-initializing the agent is the simplest way to clear context
      console.log(chalk.yellow('Context cleared.'));
      continue;
    }

    if (trimmed === '/help') {
      console.log(`Available commands:
  /exit   - Quit REPL
  /clear  - Clear current conversation context
  /help   - Show this help
`);
      continue;
    }

    try {
      const answer = await agent.run(trimmed);
      console.log(`\n${answer}\n`);
    } catch (err) {
      logger.error((err as Error).message);
    }
  }
}
