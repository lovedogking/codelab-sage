#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig, getActiveProvider, type CliOptions } from '../config/config.js';
import { createLogger } from '../utils/logger.js';
import { CodelabSageError } from '../utils/errors.js';
import { createLLMProvider, createProviderFromEntry } from '../llm/factory.js';
import { createToolRegistry } from '../tools/builtins.js';
import { loadSkills } from '../skills/loader.js';
import { Agent } from '../agent/agent.js';
import { AgentFactory } from '../agent/agent-factory.js';
import { createBuiltinAgentRegistry } from '../agents/builtins/index.js';
import { SessionManager } from '../session/manager.js';
import { PermissionManager } from '../permissions/manager.js';
import { loadMcpServers, disconnectMcpClients } from '../mcp/loader.js';
import { ChatTUI } from './chat-ui.js';
import { FullscreenUI } from './fullscreen-ui.js';

const program = new Command();

function collect(value: string, previous: string[]): string[] {
  return previous.concat(value);
}

program
  .name('codelab-sage')
  .description('A terminal CLI agent distilled from the wisdom of Codelab.')
  .version('0.6.0')
  .argument('[query]', 'The task or question to ask Sage')
  .option('-m, --model <model>', 'Model to use')
  .option('-s, --skill-dir <dir>', 'Add a custom skill directory', collect, [])
  .option('-c, --config <path>', 'Path to config file')
  .option('-r, --repl', 'Enter interactive chat mode (default when no query)')
  .option('--simple', 'Use the simple line-based REPL instead of fullscreen')
  .option('--role <role>', 'Activate a specific role (filters skills by role)')
  .option('--agent <agent>', 'Activate a specific sub-agent (coder/explore/plan)')
  .option('--yolo', 'Skip all destructive confirmations')
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

  // Try the new ProviderEntry-based path first, fall back to legacy
  const activeEntry = getActiveProvider(config);
  let provider;

  if (activeEntry) {
    provider = createProviderFromEntry(activeEntry);
    logger.verbose(
      `Using provider "${activeEntry.id}" (${activeEntry.provider}/${activeEntry.model})`,
    );
  } else if (!query || options.repl) {
    // Interactive mode: allow starting without a provider so the user can /login
    logger.verbose('No provider configured. Use /login in REPL to add one.');
    provider = {
      chat() {
        throw new CodelabSageError(
          'No provider configured. Use /login to add one first.',
          'MISSING_API_KEY',
        );
      },
    };
  } else {
    if (!config.apiKey) {
      throw new CodelabSageError(
        'No provider configured. Set OPENAI_API_KEY environment variable, use --api-key, or run /login in REPL mode.',
        'MISSING_API_KEY',
      );
    }
    provider = createLLMProvider(config);
  }

  const permissionManager = new PermissionManager(config);
  const registry = createToolRegistry(config, permissionManager);
  const mcp = await loadMcpServers(config, registry);
  const skills = await loadSkills(config.skillDirs ?? []);

  logger.verbose(`Loaded ${skills.length} skill(s)`);
  logger.verbose(`Loaded ${mcp.clients.length} MCP server(s)`);

  process.on('exit', () => {
    disconnectMcpClients(mcp.clients);
  });

  const agentOptions = {
    config,
    logger,
    provider,
    registry,
    skills,
    activeEntry,
    activeRole: config.activeRole,
  };

  const agent = new Agent(agentOptions);

  const agentRegistry = createBuiltinAgentRegistry();
  const agentFactory = new AgentFactory({
    baseOptions: agentOptions,
    toolRegistry: registry,
    skills,
    agents: agentRegistry,
  });

  const sessionManager = new SessionManager({ config });

  if (!query || options.repl) {
    if (options.simple) {
      const chat = new ChatTUI(agent, logger, config, sessionManager, permissionManager);
      await chat.start();
    } else {
      const ui = new FullscreenUI(agent, config, agentFactory, sessionManager, permissionManager);
      ui.start();
    }
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
