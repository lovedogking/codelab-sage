import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import type { Agent } from '../agent/agent.js';
import type { Logger } from '../utils/logger.js';
import type { SageConfig, ProviderEntry } from '../config/schema.js';
import { saveConfig } from '../config/config.js';
import { createProviderFromEntry } from '../llm/factory.js';
import { SessionManager } from '../session/manager.js';
import { PermissionManager } from '../permissions/manager.js';
import { TaskQueue, type QueuedTask } from './task-queue.js';

const SEP = chalk.gray('─'.repeat(60));

/**
 * ChatTUI — robust chat interface using @inquirer/prompts for input.
 *
 * Native readline({ terminal: true }) has issues on classic Windows
 * PowerShell, so we use inquirer's input loop (stable everywhere) and
 * handle message formatting ourselves.
 */

export class ChatTUI {
  private agent: Agent;
  private config: SageConfig;
  private logger: Logger;
  private sessionManager?: SessionManager;
  private permissionManager?: PermissionManager;
  private running = false;

  private currentAbortController?: AbortController;
  private exiting = false;
  private ctrlCPressCount = 0;
  private ctrlCResetTimeout?: NodeJS.Timeout;
  private taskQueue = new TaskQueue();

  constructor(
    agent: Agent,
    logger: Logger,
    config: SageConfig,
    sessionManager?: SessionManager,
    permissionManager?: PermissionManager,
  ) {
    this.agent = agent;
    this.logger = logger;
    this.config = config;
    this.sessionManager = sessionManager;
    this.permissionManager = permissionManager;
  }

  async start(): Promise<void> {
    this.running = true;
    this.permissionManager?.setConfirmHandler((message, defaultValue) =>
      confirm({ message, default: defaultValue ?? false }),
    );
    process.on('SIGINT', () => this.handleSigint());

    const entry = this.agent.currentEntry;
    const modelInfo = entry
      ? `${entry.provider}/${entry.model}`
      : 'no provider configured';

    const yoloInfo = this.permissionManager?.isYolo ? ' · YOLO' : '';
    console.log(chalk.cyan.bold(`\n  codelab-sage  ·  ${modelInfo}${yoloInfo}\n`));
    console.log(chalk.gray('  /help /roles /models /session /yolo /login /exit  |  Ctrl+C×2 or /exit to quit'));
    console.log(SEP + '\n');

    while (this.running && !this.exiting) {
      if (this.exiting) break;

      let line: string;
      try {
        line = await input({ message: chalk.green('>') });
      } catch {
        // Ctrl+C during input, or stream closed.
        if (this.exiting) break;
        continue;
      }

      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('/')) {
        const done = await this.handleCommand(trimmed);
        if (done) break;
        continue;
      }

      this.taskQueue.add(trimmed, { type: 'query' });
      void this.processQueue();
    }

    console.log(chalk.cyan('\n  Goodbye!\n'));
  }

  // ------------------------------------------------------------------
  // Ctrl+C handling
  // ------------------------------------------------------------------

  private handleSigint(): void {
    if (this.taskQueue.isBusy) {
      this.currentAbortController?.abort();
      this.taskQueue.cancelCurrent();
      console.log(chalk.yellow('\n  Task interrupted.\n'));
      return;
    }

    this.ctrlCPressCount++;
    if (this.ctrlCPressCount >= 2) {
      this.exiting = true;
      return;
    }

    console.log(chalk.gray('\n  Press Ctrl+C again to exit.\n'));
    if (this.ctrlCResetTimeout) {
      clearTimeout(this.ctrlCResetTimeout);
    }
    this.ctrlCResetTimeout = setTimeout(() => {
      this.ctrlCPressCount = 0;
    }, 1500);
  }

  // ------------------------------------------------------------------
  // Commands
  // ------------------------------------------------------------------

  private async handleCommand(line: string): Promise<boolean> {
    if (line === '/exit' || line === '/quit' || line === '/q') {
      return true;
    }

    if (line === '/help') {
      console.log(chalk.yellow('\n  Commands:'));
      console.log(chalk.gray('  /exit          Quit'));
      console.log(chalk.gray('  /help          Show this help'));
      console.log(chalk.gray('  /roles         List available roles'));
      console.log(chalk.gray('  /role [name]   Switch role, or omit name to clear'));
      console.log(chalk.gray('  /models        List configured providers'));
      console.log(chalk.gray('  /session       Session management'));
      console.log(chalk.gray('  Ctrl+C         Interrupt thinking, or double-press to exit'));
      console.log(chalk.gray('  /yolo on/off   Toggle YOLO mode'));
      console.log(chalk.gray('  /login         Add a new provider'));
      console.log(chalk.gray('  /ollama <key>  Quick connect to local Ollama (default key: ollama)'));
      console.log(chalk.gray('  /model <name>  Switch to a provider (use the alias set in /login)'));
      console.log(chalk.gray('  /compact       Compact conversation context'));
      console.log(chalk.gray('  /queue         Task queue management (list/clear/cancel)'));
      console.log(chalk.gray('  /clear         Clear chat\n'));
      return false;
    }

    if (line === '/clear') {
      console.clear();
      const entry = this.agent.currentEntry;
      const modelInfo = entry ? `${entry.provider}/${entry.model}` : 'no provider';
      console.log(chalk.cyan.bold(`\n  codelab-sage  ·  ${modelInfo}\n`));
      console.log(chalk.gray('  /help /roles /models /login /exit\n'));
      return false;
    }

    if (line === '/models') {
      const providers = this.config.providers ?? [];
      if (providers.length === 0) {
        console.log(chalk.yellow('\n  No models configured. Use /login to add one.\n'));
      } else {
        const active = this.agent.currentEntry;
        console.log('');
        for (const p of providers) {
          const marker = active?.id === p.id ? chalk.green(' *') : '  ';
          console.log(`  ${marker} ${chalk.bold(p.id)}  ${chalk.gray(p.provider)}  ${p.model}`);
        }
        console.log('');
      }
      return false;
    }

    if (line === '/login') {
      await this.doLogin();
      return false;
    }

    if (line === '/compact') {
      const removed = this.agent.compact();
      console.log(
        chalk.green(
          `\n  ✓ Context compacted. Removed ${removed} messages. ${this.agent.formatContextIndicator()}\n`,
        ),
      );
      return false;
    }

    if (line === '/ollama' || line.startsWith('/ollama ')) {
      const apiKey = line.slice('/ollama'.length).trim() || 'ollama';
      const entry = {
        id: 'ollama',
        provider: 'ollama',
        apiKey,
        baseURL: 'http://localhost:11434/v1',
        model: 'llama3',
      };
      await this.addProviderEntry(entry);
      return false;
    }

    if (line.startsWith('/model ')) {
      const targetId = line.slice(7).trim();
      const entry = (this.config.providers ?? []).find((p) => p.id === targetId);

      if (!entry) {
        console.log(chalk.red(`\n  Unknown model "${targetId}". Use /models to list.\n`));
        return false;
      }

      try {
        const newProvider = createProviderFromEntry(entry);
        this.agent.switchProvider(entry, newProvider);
        this.config.activeProvider = entry.id;
        await saveConfig(this.config);
        console.log(
          chalk.green(`\n  ✓ Switched to ${entry.id} (${entry.provider}/${entry.model})\n`),
        );
      } catch (err) {
        console.log(chalk.red(`\n  ✖ ${(err as Error).message}\n`));
      }
      return false;
    }

    if (line === '/roles') {
      const roles = this.agent.getAvailableRoles();
      const current = this.agent.currentRole;

      if (roles.length === 0) {
        console.log(chalk.yellow('\n  No roles found. Add a `role` field to a Skill frontmatter.\n'));
        return false;
      }

      console.log('');
      for (const role of roles) {
        const marker = current === role ? chalk.green(' *') : '  ';
        console.log(`  ${marker} ${chalk.bold(role)}`);
      }
      if (!current) {
        console.log(chalk.gray('  (no active role)'));
      }
      console.log('');
      return false;
    }

    if (line === '/role' || line.startsWith('/role ')) {
      const targetRole = line.slice(5).trim();

      if (!targetRole || targetRole.toLowerCase() === 'none') {
        try {
          this.agent.switchRole(undefined);
          this.config.activeRole = undefined;
          await saveConfig(this.config);
          console.log(chalk.green('\n  ✓ Role cleared. All skills are now active.\n'));
        } catch (err) {
          console.log(chalk.red(`\n  ✖ ${(err as Error).message}\n`));
        }
        return false;
      }

      const available = this.agent.getAvailableRoles();
      if (!available.includes(targetRole)) {
        console.log(
          chalk.red(`\n  Unknown role "${targetRole}". Use /roles to list available roles.\n`),
        );
        return false;
      }

      try {
        this.agent.switchRole(targetRole);
        this.config.activeRole = targetRole;
        await saveConfig(this.config);
        console.log(chalk.green(`\n  ✓ Switched to role "${targetRole}"\n`));
      } catch (err) {
        console.log(chalk.red(`\n  ✖ ${(err as Error).message}\n`));
      }
      return false;
    }

    if (line === '/session' || line.startsWith('/session ')) {
      await this.handleSessionCommand(line);
      return false;
    }

    if (line === '/queue' || line.startsWith('/queue ')) {
      this.handleQueueCommand(line);
      return false;
    }

    if (line === '/yolo' || line.startsWith('/yolo ')) {
      const arg = line.slice('/yolo'.length).trim();
      const value = arg === 'on' ? true : arg === 'off' ? false : !this.permissionManager?.isYolo;
      this.permissionManager?.setYolo(value);
      this.config.yolo = value;
      await saveConfig(this.config);
      console.log(
        value
          ? chalk.yellow('\n  ⚡ YOLO mode enabled. Confirmations are skipped.\n')
          : chalk.green('\n  ✓ YOLO mode disabled. Confirmations are active.\n'),
      );
      return false;
    }

    console.log(chalk.red(`\n  Unknown command: ${line}. Type /help.\n`));
    return false;
  }

  private async handleSessionCommand(line: string): Promise<void> {
    if (!this.sessionManager) {
      console.log(chalk.red('\n  Session manager is not available.\n'));
      return;
    }

    const args = line.slice('/session'.length).trim();

    if (!args || args === 'help') {
      console.log(chalk.yellow('\n  Session commands:'));
      console.log(chalk.gray('  /session list              List saved sessions'));
      console.log(chalk.gray('  /session save [title]      Save current session'));
      console.log(chalk.gray('  /session new [title]       Start a new session'));
      console.log(chalk.gray('  /session load <id>         Load a session'));
      console.log(chalk.gray('  /session fork <id> [title] Fork a session'));
      console.log(chalk.gray('  /session delete <id>       Delete a session\n'));
      return;
    }

    const [subCommand, ...rest] = args.split(' ');

    try {
      if (subCommand === 'list') {
        const sessions = await this.sessionManager.list();
        if (sessions.length === 0) {
          console.log(chalk.yellow('\n  No saved sessions.\n'));
        } else {
          console.log('');
          for (const s of sessions) {
            const marker = s.id === this.sessionManager.currentId ? chalk.green(' *') : '  ';
            console.log(
              `  ${marker} ${chalk.bold(s.id)}  ${s.title}  ${s.messageCount} msgs  ${chalk.gray(new Date(s.updatedAt).toLocaleString())}`,
            );
          }
          console.log('');
        }
        return;
      }

      if (subCommand === 'save') {
        const title = rest.join(' ').trim() || undefined;
        const session = await this.sessionManager.save(this.agent, title);
        console.log(chalk.green(`\n  ✓ Session saved: ${session.id} · ${session.title}\n`));
        return;
      }

      if (subCommand === 'new') {
        this.agent.importMessages([]);
        const title = rest.join(' ').trim() || undefined;
        const session = await this.sessionManager.create(this.agent, title);
        console.log(chalk.green(`\n  ✓ New session: ${session.id} · ${session.title}\n`));
        return;
      }

      if (subCommand === 'load') {
        const id = rest.join(' ').trim();
        if (!id) {
          console.log(chalk.red('\n  Usage: /session load <id>\n'));
          return;
        }
        const session = await this.sessionManager.load(id, this.agent);
        if (!session) {
          console.log(chalk.red(`\n  Session not found: ${id}\n`));
        } else {
          console.log(chalk.green(`\n  ✓ Loaded session: ${session.id} · ${session.title}\n`));
        }
        return;
      }

      if (subCommand === 'fork') {
        const id = rest[0];
        const title = rest.slice(1).join(' ').trim() || undefined;
        if (!id) {
          console.log(chalk.red('\n  Usage: /session fork <id> [title]\n'));
          return;
        }
        const session = await this.sessionManager.fork(id, this.agent, title);
        if (!session) {
          console.log(chalk.red(`\n  Session not found: ${id}\n`));
        } else {
          console.log(chalk.green(`\n  ✓ Forked session: ${session.id} · ${session.title}\n`));
        }
        return;
      }

      if (subCommand === 'delete') {
        const id = rest.join(' ').trim();
        if (!id) {
          console.log(chalk.red('\n  Usage: /session delete <id>\n'));
          return;
        }
        const deleted = await this.sessionManager.delete(id);
        console.log(
          deleted
            ? chalk.green(`\n  ✓ Deleted session: ${id}\n`)
            : chalk.red(`\n  Session not found: ${id}\n`),
        );
        return;
      }

      console.log(chalk.red(`\n  Unknown session command: ${subCommand}\n`));
    } catch (err) {
      console.log(chalk.red(`\n  ✖ ${(err as Error).message}\n`));
    }
  }

  // ------------------------------------------------------------------
  // Login
  // ------------------------------------------------------------------

  private async addProviderEntry(entry: ProviderEntry): Promise<void> {
    if (!this.config.providers) this.config.providers = [];
    // Replace existing provider with the same id to avoid duplicates.
    const existingIndex = this.config.providers.findIndex((p) => p.id === entry.id);
    if (existingIndex >= 0) {
      this.config.providers[existingIndex] = entry;
    } else {
      this.config.providers.push(entry);
    }
    this.config.activeProvider = entry.id;
    await saveConfig(this.config);

    try {
      const newProvider = createProviderFromEntry(entry);
      this.agent.switchProvider(entry, newProvider);
      console.log(chalk.green(`\n  ✓ Connected to "${entry.id}" (${entry.provider}/${entry.model})\n`));
    } catch (err) {
      console.log(chalk.yellow(`\n  ⚠ Saved but can't activate: ${(err as Error).message}\n`));
    }
  }

  private async doLogin(): Promise<void> {
    let entry: ProviderEntry | undefined;

    try {
      const providerType = await select({
        message: 'Provider type:',
        choices: [
          { name: 'OpenAI', value: 'openai' },
          { name: 'DeepSeek', value: 'deepseek' },
          { name: 'Anthropic (Claude)', value: 'anthropic' },
          { name: 'Ollama (local)', value: 'ollama' },
          { name: 'OpenAI-compatible (custom URL)', value: 'openai' },
        ],
      });

      const apiKey =
        providerType === 'ollama'
          ? await input({
              message: 'API Key (press Enter for default "ollama"):',
              default: 'ollama',
            })
          : await input({
              message: 'API Key:',
              validate: (v) => (v.length > 0 ? true : 'Required'),
            });

      let baseURL: string | undefined;
      let model: string;

      if (providerType === 'deepseek') {
        model = 'deepseek-chat';
      } else if (providerType === 'ollama') {
        baseURL =
          (await input({ message: 'Base URL:', default: 'http://localhost:11434/v1' })) ||
          'http://localhost:11434/v1';
        model = await input({
          message: 'Model:',
          default: 'llama3',
          validate: (v) => (v.length > 0 ? true : 'Required'),
        });
      } else {
        if (providerType === 'openai') {
          const customUrl = await input({ message: 'Base URL (Enter for default):' });
          if (customUrl.trim()) baseURL = customUrl.trim();
        }
        model = await input({
          message: 'Model:',
          default:
            providerType === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
          validate: (v) => (v.length > 0 ? true : 'Required'),
        });
      }

      const alias = await input({
        message: 'Alias:',
        default: providerType,
        validate: (v) => (v.length > 0 ? true : 'Required'),
      });

      entry = { id: alias, provider: providerType, apiKey, baseURL: baseURL || undefined, model };
    } catch {
      // cancelled
    }

    if (entry) {
      await this.addProviderEntry(entry);
    } else {
      console.log(chalk.gray('\n  Login cancelled.\n'));
    }
  }

  // ------------------------------------------------------------------
  // Task queue
  // ------------------------------------------------------------------

  private async processQueue(): Promise<void> {
    if (this.taskQueue.isBusy) {
      this.printQueueStatus();
      return;
    }
    if (this.taskQueue.size === 0) {
      this.printQueueStatus();
      return;
    }

    const task = this.taskQueue.startNext();
    if (!task) {
      this.printQueueStatus();
      return;
    }

    this.printQueueStatus();
    try {
      await this.runTask(task);
    } finally {
      this.taskQueue.finishCurrent();
      this.currentAbortController = undefined;
    }
    this.maybeAutoCompact();
    this.printQueueStatus();

    void this.processQueue();
  }

  private async runTask(task: QueuedTask): Promise<void> {
    this.logger.verbose(`User query: ${task.text}`);
    console.log(chalk.cyan(`\n  🧙 ${task.text}\n`));

    this.currentAbortController = new AbortController();
    const spinner = ora({ text: chalk.gray('Thinking...'), color: 'cyan' }).start();

    try {
      const answer = await this.agent.run(task.text, this.currentAbortController.signal);
      spinner.stop();
      console.log(`  ${answer}\n`);
    } catch (err) {
      spinner.stop();
      if ((err as Error).message === 'Thinking interrupted.') {
        console.log(chalk.yellow(`\n  Task interrupted.\n`));
      } else {
        console.log(chalk.red(`\n  ✖ ${(err as Error).message}\n`));
      }
    } finally {
      this.currentAbortController = undefined;
    }

    console.log(chalk.gray(`  ${this.agent.formatContextIndicator()}`));
    console.log(SEP);
  }

  private printQueueStatus(): void {
    const stats = this.taskQueue.stats();
    if (stats.current) {
      const preview =
        stats.current.text.length > 24 ? `${stats.current.text.slice(0, 24)}…` : stats.current.text;
      console.log(chalk.gray(`  [队列] 正在处理: ${preview} · 等待 ${stats.waiting.length} 个任务`));
    } else if (stats.waiting.length > 0) {
      console.log(chalk.gray(`  [队列] ${stats.waiting.length} 个任务等待中`));
    }
  }

  private handleQueueCommand(line: string): void {
    const args = line.slice('/queue'.length).trim();

    if (!args || args === 'help') {
      console.log(chalk.yellow('\n  Queue commands:'));
      console.log(chalk.gray('  /queue list    List waiting and current tasks'));
      console.log(chalk.gray('  /queue clear   Clear all waiting tasks'));
      console.log(chalk.gray('  /queue cancel  Cancel the current task\n'));
      return;
    }

    if (args === 'list') {
      const stats = this.taskQueue.stats();
      const lines: string[] = [];
      if (stats.current) {
        lines.push(`→ ${chalk.cyan(stats.current.text)}`);
      }
      stats.waiting.forEach((task, i) => {
        lines.push(`  ${i + 1}. ${task.text}`);
      });
      if (lines.length === 0) {
        console.log(chalk.yellow('\n  Queue is empty.\n'));
      } else {
        console.log(chalk.yellow('\n  Task queue:\n') + lines.join('\n') + '\n');
      }
      return;
    }

    if (args === 'clear') {
      const removed = this.taskQueue.clear();
      console.log(chalk.green(`\n  ✓ Cleared ${removed} waiting task(s).\n`));
      return;
    }

    if (args === 'cancel') {
      if (!this.taskQueue.isBusy) {
        console.log(chalk.yellow('\n  No task is currently running.\n'));
      } else {
        this.currentAbortController?.abort();
        this.taskQueue.cancelCurrent();
        console.log(chalk.yellow('\n  Cancelling current task...\n'));
      }
      return;
    }

    console.log(chalk.red(`\n  Unknown queue command: ${args}\n`));
  }

  private maybeAutoCompact(): void {
    const stats = this.agent.getContextStats();
    if (stats.percentage >= 100) {
      const removed = this.agent.compact();
      console.log(
        chalk.yellow(
          `\n  Context limit reached. Auto-compacted: removed ${removed} messages. ${this.agent.formatContextIndicator()}\n`,
        ),
      );
    }
  }
}
