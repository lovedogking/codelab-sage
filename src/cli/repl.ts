import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import type { Agent } from '../agent/agent.js';
import type { Logger } from '../utils/logger.js';
import type { SageConfig } from '../config/schema.js';
import { saveConfig } from '../config/config.js';
import { createProviderFromEntry } from '../llm/factory.js';
import { runLoginWizard } from './login-wizard.js';

export async function startRepl(agent: Agent, logger: Logger, config: SageConfig): Promise<void> {
  console.log(
    chalk.cyan('🧙 Welcome to codelab-sage REPL. Type /help for commands, /exit to quit.\n'),
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const line = await input({ message: chalk.cyan('sage>') });
    const trimmed = line.trim();

    if (!trimmed) continue;

    // ---- built-in commands ----

    if (trimmed === '/exit') {
      console.log(chalk.cyan('Goodbye!'));
      break;
    }

    if (trimmed === '/clear') {
      console.log(chalk.yellow('Context cleared.'));
      continue;
    }

    if (trimmed === '/help') {
      console.log(`Available commands:
  /exit      - Quit REPL
  /clear     - Clear current conversation context
  /login     - Add a new model provider
  /models    - List configured model providers
  /model <name>- Switch to a different model (use the alias set in /login)
  /help      - Show this help
`);
      continue;
    }

    // ---- /models ----

    if (trimmed === '/models') {
      const providers = config.providers ?? [];
      if (providers.length === 0) {
        console.log(chalk.yellow('\n  No models configured yet. Use /login to add one.\n'));
        console.log(
          chalk.gray(
            '  You can also set OPENAI_API_KEY as an environment variable\n  for the default OpenAI provider.\n',
          ),
        );
      } else {
        const active = agent.currentEntry;
        console.log('');
        for (const p of providers) {
          const marker = active?.id === p.id ? chalk.green(' *') : '  ';
          console.log(
            `${marker} ${chalk.bold(p.id)}  ${chalk.gray(p.provider)}  ${p.model}${p.baseURL ? chalk.gray(`  (${p.baseURL})`) : ''}`,
          );
        }
        console.log('');
      }
      continue;
    }

    // ---- /model <name> ----

    if (trimmed.startsWith('/model ')) {
      const targetId = trimmed.slice(7).trim();
      const providers = config.providers ?? [];
      const entry = providers.find((p) => p.id === targetId);

      if (!entry) {
        console.log(
          chalk.red(`\n  Unknown model "${targetId}". Use /models to see available models.\n`),
        );
        continue;
      }

      try {
        const newProvider = createProviderFromEntry(entry);
        agent.switchProvider(entry, newProvider);
        config.activeProvider = entry.id;
        await saveConfig(config);
        console.log(
          chalk.green(`\n  ✓ Switched to ${entry.id} (${entry.provider}/${entry.model})\n`),
        );
      } catch (err) {
        console.log(chalk.red(`\n  ✖ ${(err as Error).message}\n`));
      }
      continue;
    }

    // ---- /login ----

    if (trimmed === '/login') {
      const entry = await runLoginWizard();
      if (!entry) {
        continue;
      }

      // Save to config
      if (!config.providers) {
        config.providers = [];
      }
      config.providers.push(entry);
      config.activeProvider = entry.id;
      await saveConfig(config);

      // Create the provider and switch to it
      try {
        const newProvider = createProviderFromEntry(entry);
        agent.switchProvider(entry, newProvider);
        console.log(
          chalk.green(
            `\n  ✓ Added provider "${entry.id}" (${entry.provider}/${entry.model}) and switched to it.\n`,
          ),
        );
      } catch (err) {
        console.log(
          chalk.yellow(
            `\n  ⚠ Provider saved but could not activate: ${(err as Error).message}\n`,
          ),
        );
      }
      continue;
    }

    // ---- regular query ----

    try {
      const answer = await agent.run(trimmed);
      console.log(`\n${answer}\n`);
    } catch (err) {
      logger.error((err as Error).message);
    }
  }
}

