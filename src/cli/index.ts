#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig, type CliOptions } from '../config/config.js';
import { createLogger } from '../utils/logger.js';
import { CodelabSageError } from '../utils/errors.js';
import { createLLMProvider } from '../llm/factory.js';
import { createToolRegistry } from '../tools/builtins.js';
import { loadSkills } from '../skills/loader.js';
import { Agent } from '../agent/agent.js';
import { startRepl } from './repl.js';

const program = new Command();

function collect(value: string, previous: string[]): string[] {
  return previous.concat(value);
}

program
  .name('codelab-sage')
  .description('A terminal CLI agent distilled from the wisdom of Codelab.')
  .version('0.1.0')
  .argument('[query]', 'The task or question to ask Sage')
  .option('-m, --model <model>', 'Model to use')
  .option('-s, --skill-dir <dir>', 'Add a custom skill directory', collect, [])
  .option('-c, --config <path>', 'Path to config file')
  .option('-r, --repl', 'Enter interactive REPL mode')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--no-confirm', 'Disable confirmation for destructive actions')
  .option('-k, --api-key <key>', 'API key (use environment variable instead)');

async function main() {
  program.parse();

  const options = program.opts<CliOptions>();
  const query = program.args.join(' ').trim();

  const config = await loadConfig(options);
  const logger = createLogger(config.logLevel ?? 'info');

  logger.verbose('Loaded config', config);

  if (!query && !options.repl) {
    program.help();
    return;
  }

  if (!config.apiKey) {
    throw new CodelabSageError(
      'API key is required. Set OPENAI_API_KEY environment variable or use --api-key.',
      'MISSING_API_KEY',
    );
  }

  const provider = createLLMProvider(config);
  const registry = createToolRegistry(config);
  const skills = await loadSkills(config.skillDirs ?? []);

  logger.verbose(`Loaded ${skills.length} skill(s)`);

  const agent = new Agent({
    config,
    logger,
    provider,
    registry,
    skills,
  });

  if (options.repl) {
    await startRepl(agent, logger);
    return;
  }

  const answer = await agent.run(query);
  console.log(answer);
}

main().catch((err: unknown) => {
  if (err instanceof CodelabSageError) {
    console.error(`✖ ${err.message}`);
  } else {
    console.error('✖ Unexpected error:', err);
  }
  process.exit(1);
});
