import blessed from 'blessed';
import chalk from 'chalk';
import boxen from 'boxen';
import type { Agent } from '../agent/agent.js';
import { AgentFactory } from '../agent/agent-factory.js';
import { SessionManager } from '../session/manager.js';
import { PermissionManager } from '../permissions/manager.js';
import path from 'path';
import type { SageConfig, ProviderEntry } from '../config/schema.js';
import { saveConfig } from '../config/config.js';
import { createProviderFromEntry } from '../llm/factory.js';
import { runLoginWizard } from './login-wizard.js';
import { getGitStatus } from '../utils/git.js';
import { searchCode } from '../utils/search.js';
import { TaskQueue, type QueuedTask } from './task-queue.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface CommandItem {
  name: string;
  description: string;
  category: string;
}

const COMMANDS: CommandItem[] = [
  { name: '/help', description: '显示帮助信息', category: '系统' },
  { name: '/exit', description: '退出程序', category: '系统' },
  { name: '/clear', description: '清空对话', category: '系统' },
  { name: '/history', description: '查看输入历史', category: '系统' },
  { name: '/status', description: '查看当前状态', category: '系统' },
  { name: '/skills', description: '查看可用技能', category: '系统' },
  { name: '/roles', description: '查看可用角色', category: '系统' },
  { name: '/role', description: '切换角色 (/role <name>)', category: '系统' },
  { name: '/models', description: '列出已配置模型', category: '配置' },
  { name: '/model', description: '切换模型 (/model <id>)', category: '配置' },
  { name: '/login', description: '添加模型 provider', category: '配置' },
  { name: '/ollama', description: '快速接入本地 Ollama (/ollama <apikey>)', category: '配置' },
  { name: '/compact', description: '压缩对话上下文', category: '配置' },
  { name: '/agents', description: '查看可用 Agent', category: 'Agent' },
  { name: '/agent', description: '切换 Agent (/agent <name>)', category: 'Agent' },
  { name: '/plan', description: '进入规划模式 (/plan <task>)', category: 'Agent' },
  { name: '/explore', description: '进入探索模式 (/explore <task>)', category: 'Agent' },
  { name: '/search', description: '搜索代码 (/search <query>)', category: '工具' },
  { name: '/yolo', description: '切换 YOLO 模式 (/yolo on/off)', category: '工具' },
  { name: '/queue', description: '任务队列管理 (/queue list/clear/cancel)', category: '队列' },
  { name: '/session', description: '会话管理 (/session save/list/load/fork)', category: '会话' },
];

const VISIBLE_MENU_ITEMS = 8;

const ASCII_SAGE =
  ' ███████╗ █████╗  ██████╗ ███████╗\n' +
  ' ██╔════╝ ██╔══██╗██╔════╝ ██╔════╝\n' +
  ' ███████╗ ███████║██║  ███╗█████╗\n' +
  ' ╚════██║ ██╔══██║██║   ██║██╔══╝\n' +
  ' ███████║ ██║  ██║╚██████╔╝███████╗\n' +
  ' ╚══════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝';

const WELCOME_TEXT = boxen(
  `${chalk.cyan.bold(ASCII_SAGE)}\n\n${chalk.white('✦ 欢迎回来 ✦')}\n\n${chalk.gray('模型:')} ${chalk.white('待配置')}\n${chalk.gray('版本:')} ${chalk.white('v0.1.0')}\n\n${chalk.gray('输入 /help 查看所有命令')}`,
  {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan',
    align: 'center',
  },
);

export class FullscreenUI {
  private agent: Agent;
  private config: SageConfig;
  private agentFactory?: AgentFactory;
  private sessionManager?: SessionManager;
  private permissionManager?: PermissionManager;

  private screen!: blessed.Widgets.Screen;
  private chatBox!: blessed.Widgets.BoxElement;
  private inputContainer!: blessed.Widgets.BoxElement;
  private inputBox!: blessed.Widgets.TextboxElement;
  private suggestionBox!: blessed.Widgets.BoxElement;
  private commandMenuBox!: blessed.Widgets.BoxElement;
  private commandMenuItems!: blessed.Widgets.BoxElement;
  private commandMenuFooter!: blessed.Widgets.TextElement;
  private statusBar!: blessed.Widgets.BoxElement;

  private menuFilteredCommands: typeof COMMANDS = [];
  private menuSelectedIndex = 0;
  private menuScrollOffset = 0;
  private welcomeBox?: blessed.Widgets.BoxElement;

  private currentAgentName = 'default';
  private activeSubAgent?: Agent;

  private history: string[] = [];
  private historyIndex = 0;
  private historyDraft = '';

  private chatLines: string[] = [];
  private taskQueue = new TaskQueue();
  private quitting = false;

  private spinnerIndex = 0;
  private spinnerInterval: NodeJS.Timeout | null = null;

  private currentAbortController?: AbortController;
  private ctrlCPressCount = 0;
  private ctrlCResetTimeout?: NodeJS.Timeout;

  private gitBranch: string | null = null;
  private gitDirty = false;

  constructor(
    agent: Agent,
    config: SageConfig,
    agentFactory?: AgentFactory,
    sessionManager?: SessionManager,
    permissionManager?: PermissionManager,
  ) {
    this.agent = agent;
    this.config = config;
    this.agentFactory = agentFactory;
    this.sessionManager = sessionManager;
    this.permissionManager = permissionManager;

    if (config.activeAgent && agentFactory?.has(config.activeAgent)) {
      this.currentAgentName = config.activeAgent;
      this.activeSubAgent = agentFactory.createAgent(config.activeAgent);
    }
  }

  start(): void {
    this.permissionManager?.setConfirmHandler((message, defaultValue) =>
      this.confirm(message, defaultValue ?? false),
    );
    void this.initGit();
    this.buildScreen();
    this.bindKeys();
    this.showWelcome();
    this.updateStatusBar();
    this.screen.render();
  }

  // ------------------------------------------------------------------
  // Initialization
  // ------------------------------------------------------------------

  private async initGit(): Promise<void> {
    const status = await getGitStatus(process.cwd());
    this.gitBranch = status.branch;
    this.gitDirty = status.dirty;
  }

  // ------------------------------------------------------------------
  // Agent helpers
  // ------------------------------------------------------------------

  private getCurrentAgent(): Agent {
    return this.activeSubAgent ?? this.agent;
  }

  private switchAgent(name: string): void {
    if (!this.agentFactory) {
      throw new Error('Agent factory is not available');
    }
    if (name === 'default') {
      this.currentAgentName = 'default';
      this.activeSubAgent = undefined;
      return;
    }
    if (!this.agentFactory.has(name)) {
      throw new Error(`Unknown agent: ${name}`);
    }
    this.activeSubAgent = this.agentFactory.createAgent(name);
    this.currentAgentName = name;
  }

  private async runSubAgentTask(
    name: string,
    task: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.agentFactory) {
      throw new Error('Agent factory is not available');
    }
    if (!this.agentFactory.has(name)) {
      throw new Error(`Unknown agent: ${name}`);
    }

    const subAgent = this.agentFactory.createAgent(name);
    const parentMessages = this.agent.getRecentMessages(5);

    this.addSystemMessage(`🚀 Invoking ${name} agent...`);

    try {
      const answer = await subAgent.runWithContext(task, parentMessages, signal);
      await this.streamResponse(answer);
    } catch (err) {
      if ((err as Error).message === 'Thinking interrupted.') {
        this.addSystemMessage('Task interrupted.');
      } else {
        this.addSystemMessage(`Error: ${(err as Error).message}`);
      }
    }
  }

  // ------------------------------------------------------------------
  // Screen construction
  // ------------------------------------------------------------------

  private buildScreen(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      title: 'codelab-sage',
      cursor: {
        artificial: true,
        blink: true,
        color: 'white',
        shape: 'block',
      },
    });

    // Chat log occupies everything except bottom area.
    this.chatBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      bottom: 5,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
      },
      style: {
        fg: 'white',
        bg: 'default',
      },
      tags: true,
      wrap: true,
    });

    // Inline autocomplete suggestion (hidden by default).
    this.suggestionBox = blessed.box({
      parent: this.screen,
      bottom: 5,
      left: 0,
      width: '100%',
      height: 1,
      content: '',
      tags: true,
      focusable: false,
      style: {
        fg: 'gray',
        bg: 'default',
      },
      hidden: true,
    });

    // Slash command menu (hidden by default).
    this.commandMenuBox = blessed.box({
      parent: this.screen,
      bottom: 5,
      left: 0,
      width: 48,
      height: VISIBLE_MENU_ITEMS + 3,
      border: {
        type: 'line',
      },
      focusable: false,
      style: {
        border: {
          fg: 'cyan',
        },
      },
      hidden: true,
    });

    this.commandMenuItems = blessed.box({
      parent: this.commandMenuBox,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-3',
      content: '',
      tags: true,
      style: {
        fg: 'white',
        bg: 'default',
      },
    });

    this.commandMenuFooter = blessed.text({
      parent: this.commandMenuBox,
      bottom: 0,
      left: 0,
      width: '100%-2',
      height: 1,
      content: '',
      tags: true,
      style: {
        fg: 'gray',
        bg: 'default',
      },
    });

    // Input container with inline cyan prompt and textbox.
    this.inputContainer = blessed.box({
      parent: this.screen,
      bottom: 2,
      left: 0,
      width: '100%',
      height: 3,
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'cyan',
        },
      },
    });

    blessed.text({
      parent: this.inputContainer,
      top: 0,
      left: 0,
      width: 2,
      height: 1,
      content: chalk.cyan.bold('> '),
      style: {
        fg: 'cyan',
        bg: 'default',
      },
    });

    this.inputBox = blessed.textbox({
      parent: this.inputContainer,
      top: 0,
      left: 2,
      width: '100%-2',
      height: 1,
      inputOnFocus: false,
      keys: true,
      mouse: false,
      cursor: {
        artificial: true,
        shape: 'line',
        blink: true,
        color: 'cyan',
      },
      style: {
        fg: 'white',
        bg: 'default',
        focus: {
          fg: 'white',
        },
      },
    });

    // Status bar.
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: {
        fg: 'black',
        bg: 'cyan',
      },
      tags: true,
      content: ' Ready ',
    });

    this.ensureInputFocus();
  }

  // ------------------------------------------------------------------
  // Welcome screen
  // ------------------------------------------------------------------

  private showWelcome(): void {
    this.welcomeBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 'shrink',
      height: 'shrink',
      content: WELCOME_TEXT,
      tags: true,
      style: {
        bg: 'default',
      },
      transparent: true,
    });

    this.setStatus(' Press any key to start ');

    const dismiss = (): void => {
      if (this.welcomeBox) {
        this.welcomeBox.detach();
        this.welcomeBox = undefined;
        this.setStatus(' Ready ');
        this.ensureInputFocus();
        this.screen.render();
      }
    };

    this.screen.once('keypress', dismiss);
    this.inputBox.on('keypress', dismiss);
  }

  // ------------------------------------------------------------------
  // Key bindings
  // ------------------------------------------------------------------

  private bindKeys(): void {
    this.screen.key(['C-c'], () => {
      this.handleCtrlC();
    });

    this.screen.key(['escape'], () => {
      this.quit();
    });

    this.screen.key(['C-l'], () => {
      this.chatLines = [];
      this.renderChat();
      this.ensureInputFocus();
    });

    // Input submit — Enter in the textbox.
    this.inputBox.on('submit', () => {
      this.handleInputSubmit();
    });

    // Forward ALL keypress events from the screen to the inputBox.
    // This bypasses blessed's focus-based dispatch which is unreliable on
    // Windows (stdin raw mode may not activate properly on PowerShell/conhost).
    this.screen.on('keypress', (ch, key) => {
      if (this.welcomeBox) return;
      this.inputBox.emit('keypress', ch, key);
    });

    // Handle custom key logic (command menu, autocomplete, history) after
    // the textbox has processed the key and updated its internal value.
    this.inputBox.on('keypress', (_ch: string, key: blessed.Widgets.Events.IKeyEventArg) => {
      this.handleInputKeypress(key);
    });
  }

  /**
   * Show a blessed confirmation dialog and return the user's choice.
   * This avoids using @inquirer/prompts while blessed owns stdin.
   */
  private confirm(message: string, defaultValue: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      const width = Math.min(72, (this.screen.width as number) - 4);
      const prompt = `[${defaultValue ? 'Y' : 'y'}]es / [${defaultValue ? 'n' : 'N'}]o`;
      const content = `${message}\n\n${chalk.gray(prompt)}`;

      const dialog = blessed.box({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width,
        height: 'shrink',
        padding: 1,
        content,
        tags: true,
        border: {
          type: 'line',
        },
        style: {
          border: {
            fg: 'yellow',
          },
          bg: 'default',
        },
      });

      const cleanup = (result: boolean): void => {
        dialog.detach();
        this.ensureInputFocus();
        this.screen.render();
        resolve(result);
      };

      dialog.focus();
      this.screen.render();

      const handler = (_ch: string, key: blessed.Widgets.Events.IKeyEventArg): void => {
        if (!key) return;
        const name = key.name;
        if (name === 'return') {
          dialog.off('keypress', handler);
          cleanup(defaultValue);
          return;
        }
        if (name === 'escape') {
          dialog.off('keypress', handler);
          cleanup(false);
          return;
        }
        if (name === 'y') {
          dialog.off('keypress', handler);
          cleanup(true);
          return;
        }
        if (name === 'n') {
          dialog.off('keypress', handler);
          cleanup(false);
          return;
        }
      };

      dialog.on('keypress', handler);
    });
  }

  private handleCtrlC(): void {
    if (this.welcomeBox) {
      this.quit();
      return;
    }

    if (this.taskQueue.isBusy) {
      this.currentAbortController?.abort();
      this.taskQueue.cancelCurrent();
      this.stopSpinner();
      this.addSystemMessage('Task interrupted.');
      this.updateStatusBar();
      this.ensureInputFocus();
      return;
    }

    this.ctrlCPressCount++;
    if (this.ctrlCPressCount >= 2) {
      this.quit();
      return;
    }

    this.setStatus(' Press Ctrl+C again to exit ');
    if (this.ctrlCResetTimeout) {
      clearTimeout(this.ctrlCResetTimeout);
    }
    this.ctrlCResetTimeout = setTimeout(() => {
      this.ctrlCPressCount = 0;
      this.setStatus(' Ready ');
    }, 1500);
  }

  private handleInputKeypress(key: blessed.Widgets.Events.IKeyEventArg): void {
    if (this.welcomeBox) return;

    const name = key.name;

    // Tab accepts autocomplete suggestion.
    if (name === 'tab') {
      this.acceptAutocomplete();
      return;
    }

    // Esc closes command menu.
    if (name === 'escape') {
      this.hideCommandMenu();
      return;
    }

    // Menu navigation.
    if (!this.commandMenuBox.hidden) {
      if (name === 'up') {
        this.menuSelectedIndex =
          this.menuSelectedIndex > 0 ? this.menuSelectedIndex - 1 : this.menuFilteredCommands.length - 1;
        this.renderCommandMenuItems();
        this.screen.render();
        return;
      }
      if (name === 'down') {
        this.menuSelectedIndex =
          this.menuSelectedIndex < this.menuFilteredCommands.length - 1 ? this.menuSelectedIndex + 1 : 0;
        this.renderCommandMenuItems();
        this.screen.render();
        return;
      }
      if (name === 'enter') {
        const selected = this.menuFilteredCommands[this.menuSelectedIndex];
        if (selected) {
          this.inputBox.setValue(selected.name + ' ');
          this.hideCommandMenu();
          this.screen.render();
        }
        return;
      }
    } else {
      // History navigation when menu is closed.
      if (name === 'up') {
        this.navigateHistory(-1);
        return;
      }
      if (name === 'down') {
        this.navigateHistory(1);
        return;
      }
    }

    // After any other key, update menu / autocomplete.
    // Defer slightly so the inputBox value has been updated by blessed.
    setImmediate(() => {
      this.updateInputUI();
    });
  }

  // ------------------------------------------------------------------
  // Input UI (command menu + autocomplete)
  // ------------------------------------------------------------------

  private updateInputUI(): void {
    const value = this.inputBox.getValue();

    if (value.startsWith('/')) {
      this.updateCommandMenu(value);
      this.hideSuggestion();
    } else {
      this.hideCommandMenu();
      this.hideSuggestion();
    }
  }

  private updateCommandMenu(value: string): void {
    const query = value.slice(1).toLowerCase();
    const filtered = COMMANDS.filter((c) => c.name.toLowerCase().startsWith('/' + query));

    if (filtered.length === 0) {
      this.hideCommandMenu();
      return;
    }

    const wasHidden = this.commandMenuBox.hidden;
    this.menuFilteredCommands = filtered;
    this.menuSelectedIndex = 0;
    this.menuScrollOffset = 0;
    this.renderCommandMenuItems();

    const total = filtered.length;
    const scrollHint = total > VISIBLE_MENU_ITEMS ? ' ↑↓ 滚动查看更多' : '';
    this.commandMenuFooter.setContent(chalk.gray(` 共 ${total} 个命令${scrollHint}`));

    this.commandMenuBox.show();
    // Only force a full render when the menu first appears. While the user
    // keeps typing, the focused textbox already triggers renders, which will
    // pick up the updated menu content.
    if (wasHidden) {
      this.screen.render();
    }
  }

  private renderCommandMenuItems(): void {
    // Keep the selected item inside the visible window.
    if (this.menuSelectedIndex < this.menuScrollOffset) {
      this.menuScrollOffset = this.menuSelectedIndex;
    } else if (this.menuSelectedIndex >= this.menuScrollOffset + VISIBLE_MENU_ITEMS) {
      this.menuScrollOffset = this.menuSelectedIndex - VISIBLE_MENU_ITEMS + 1;
    }

    const visible = this.menuFilteredCommands.slice(
      this.menuScrollOffset,
      this.menuScrollOffset + VISIBLE_MENU_ITEMS,
    );

    const lines = visible.map((c, i) => {
      const actualIndex = this.menuScrollOffset + i;
      const isSelected = actualIndex === this.menuSelectedIndex;
      const prefix = isSelected ? chalk.cyan.bold('>') : ' ';
      const name = isSelected ? chalk.cyan.bold(c.name) : c.name;
      const category = chalk.gray(`[${c.category}]`);
      const desc = chalk.gray(c.description);
      return `${prefix} ${category} ${name} ${desc}`;
    });
    this.commandMenuItems.setContent(lines.join('\n'));
  }

  private hideCommandMenu(): void {
    if (!this.commandMenuBox.hidden) {
      this.commandMenuBox.hide();
      this.menuFilteredCommands = [];
      this.menuSelectedIndex = 0;
      this.menuScrollOffset = 0;
      this.screen.render();
    }
  }

  /**
   * Focus the input box only if it is not already focused.
   * Repeated focus() calls on a textbox with inputOnFocus can cause the
   * current input to be redrawn, producing duplicated characters.
   */
  private ensureInputFocus(): void {
    if (this.screen.focused !== this.inputBox) {
      this.inputBox.focus();
      this.screen.render();
    }
  }

  private acceptAutocomplete(): void {
    if (!this.commandMenuBox.hidden) {
      const selected = this.menuFilteredCommands[this.menuSelectedIndex];
      if (selected) {
        this.inputBox.setValue(selected.name + ' ');
        this.hideCommandMenu();
        this.screen.render();
      }
      return;
    }

    const value = this.inputBox.getValue();
    if (!value.startsWith('/')) return;

    const matches = COMMANDS.filter((c) => c.name.startsWith(value));
    if (matches.length === 1) {
      this.inputBox.setValue(matches[0].name + ' ');
      this.screen.render();
    }
  }

  private hideSuggestion(): void {
    if (!this.suggestionBox.hidden) {
      this.suggestionBox.hide();
      this.screen.render();
    }
  }

  // ------------------------------------------------------------------
  // History
  // ------------------------------------------------------------------

  private navigateHistory(direction: number): void {
    if (this.history.length === 0) return;

    if (this.historyIndex === this.history.length) {
      this.historyDraft = this.inputBox.getValue();
    }

    const newIndex = this.historyIndex + direction;
    if (newIndex < 0 || newIndex > this.history.length) return;

    this.historyIndex = newIndex;
    if (this.historyIndex === this.history.length) {
      this.inputBox.setValue(this.historyDraft);
    } else {
      this.inputBox.setValue(this.history[this.historyIndex]);
    }
    this.screen.render();
  }

  // ------------------------------------------------------------------
  // Input submission & message queue
  // ------------------------------------------------------------------

  private handleInputSubmit(): void {
    if (this.welcomeBox) return;

    const raw = this.inputBox.getValue().trim();
    this.inputBox.setValue('');
    this.historyDraft = '';
    this.screen.render();

    if (!raw) {
      return;
    }

    // Save history.
    this.history.push(raw);
    this.historyIndex = this.history.length;

    // Slash commands.
    if (raw === '/exit' || raw === '/quit') {
      this.quit();
      return;
    }

    if (raw === '/clear') {
      this.chatLines = [];
      this.renderChat();
      this.ensureInputFocus();
      return;
    }

    if (raw === '/help') {
      this.addSystemMessage(`Shortcuts:
  /            Command menu
  ↑ / ↓        History
  Tab          Accept completion
  Ctrl+C       Interrupt thinking (once) or double-press to exit
  Esc          Exit

系统命令:
  /help        Show this help
  /exit        Quit
  /clear       Clear chat
  /history     Input history
  /status      Current status
  /skills      Loaded skills
  /roles       Available roles
  /role <name> Switch role

配置命令:
  /models      List providers
  /model <id>  Switch provider
  /login       Add provider
  /compact     Compact conversation context

Agent 命令:
  /agents      List agents
  /agent <n>   Switch agent
  /plan <task> Plan a task
  /explore <q> Explore codebase

工具命令:
  /search <q>  Search code

队列命令:
  /queue list    List waiting tasks
  /queue clear   Clear waiting tasks
  /queue cancel  Cancel current task

会话命令:
  /session     Session management`);
      this.ensureInputFocus();
      return;
    }

    if (raw === '/login') {
      void this.doLogin();
      return;
    }

    if (raw === '/compact') {
      const removed = this.getCurrentAgent().compact();
      this.addSystemMessage(
        `Context compacted. Removed ${removed} messages. ${this.getCurrentAgent().formatContextIndicator()}`,
      );
      this.updateStatusBar();
      this.ensureInputFocus();
      return;
    }

    if (raw === '/ollama' || raw.startsWith('/ollama ')) {
      const apiKey = raw.slice('/ollama'.length).trim() || 'ollama';
      const entry = {
        id: 'ollama',
        provider: 'ollama',
        apiKey,
        baseURL: 'http://localhost:11434/v1',
        model: 'llama3',
      };
      void this.addProviderEntry(entry);
      return;
    }

    if (raw === '/models') {
      const providers = this.config.providers ?? [];
      const active = this.agent.currentEntry;
      if (providers.length === 0) {
        this.addSystemMessage('No providers configured. Use /login to add one.');
      } else {
        this.addSystemMessage(
          'Configured providers:\n' +
            providers
              .map((p) => `${p.id === active?.id ? '*' : ' '} ${p.id} · ${p.provider}/${p.model}`)
              .join('\n'),
        );
      }
      this.ensureInputFocus();
      return;
    }

    if (raw.startsWith('/model ')) {
      const targetId = raw.slice('/model '.length).trim();
      const entry = (this.config.providers ?? []).find((p) => p.id === targetId);
      if (!entry) {
        this.addSystemMessage(`Unknown provider "${targetId}". Use /models to list.`);
        this.ensureInputFocus();
        return;
      }
      try {
        const newProvider = createProviderFromEntry(entry);
        this.agent.switchProvider(entry, newProvider);
        this.config.activeProvider = entry.id;
        void saveConfig(this.config);
        this.addSystemMessage(`Switched to ${entry.id} (${entry.provider}/${entry.model})`);
        this.updateStatusBar();
      } catch (err) {
        this.addSystemMessage(`Error: ${(err as Error).message}`);
      }
      this.ensureInputFocus();
      return;
    }

    if (raw === '/history') {
      if (this.history.length === 0) {
        this.addSystemMessage('No input history yet.');
      } else {
        this.addSystemMessage(
          'Input history:\n' +
            this.history
              .slice(-10)
              .map((h, i) => `${i + 1}. ${h}`)
              .join('\n'),
        );
      }
      this.ensureInputFocus();
      return;
    }

    if (raw === '/status') {
      const entry = this.agent.currentEntry;
      const role = this.agent.currentRole;
      const cwd = process.cwd();
      const git = this.gitBranch ? `${this.gitBranch}${this.gitDirty ? '*' : ''}` : 'no git';
      this.addSystemMessage(
        `Current status:\n` +
          `  Model: ${entry ? `${entry.provider}/${entry.model}` : 'not configured'}\n` +
          `  Agent: ${this.currentAgentName}\n` +
          `  Role: ${role ?? 'none'}\n` +
          `  CWD: ${cwd}\n` +
          `  Git: ${git}`,
      );
      this.ensureInputFocus();
      return;
    }

    if (raw === '/skills') {
      const skills = this.agent.getAllSkills();
      if (skills.length === 0) {
        this.addSystemMessage('No skills loaded.');
      } else {
        this.addSystemMessage(
          'Loaded skills:\n' +
            skills.map((s) => `  ${s.name}${s.role ? chalk.gray(` [${s.role}]`) : ''}`).join('\n'),
        );
      }
      this.ensureInputFocus();
      return;
    }

    if (raw.startsWith('/role ')) {
      const targetRole = raw.slice('/role '.length).trim();
      const available = this.agent.getAvailableRoles();
      if (targetRole.toLowerCase() === 'none') {
        this.agent.switchRole(undefined);
        this.config.activeRole = undefined;
        void saveConfig(this.config);
        this.addSystemMessage('Role cleared. All skills are now active.');
        this.updateStatusBar();
        this.ensureInputFocus();
        return;
      }
      if (!available.includes(targetRole)) {
        this.addSystemMessage(`Unknown role "${targetRole}". Use /roles to list.`);
        this.ensureInputFocus();
        return;
      }
      try {
        this.agent.switchRole(targetRole);
        this.config.activeRole = targetRole;
        void saveConfig(this.config);
        this.addSystemMessage(`Switched to role "${targetRole}"`);
        this.updateStatusBar();
      } catch (err) {
        this.addSystemMessage(`Error: ${(err as Error).message}`);
      }
      this.ensureInputFocus();
      return;
    }

    if (raw === '/roles') {
      const roles = this.agent.getAvailableRoles();
      const current = this.agent.currentRole;
      if (roles.length === 0) {
        this.addSystemMessage('No roles found. Add a `role` field to a Skill frontmatter.');
      } else {
        this.addSystemMessage(
          'Available roles:\n' +
            roles.map((r) => (r === current ? `* ${r}` : `  ${r}`)).join('\n'),
        );
      }
      this.ensureInputFocus();
      return;
    }

    if (raw === '/agents') {
      const defs = this.agentFactory?.getDefinitions() ?? [];
      const lines = [
        '* default — 通用主 Agent',
        ...defs.map((d) => `  ${d.name} — ${d.description}`),
      ];
      this.addSystemMessage('Available agents:\n' + lines.join('\n'));
      this.ensureInputFocus();
      return;
    }

    if (raw.startsWith('/agent ')) {
      const name = raw.slice('/agent '.length).trim();
      if (!name) {
        this.addSystemMessage('Usage: /agent <name>');
      } else {
        try {
          this.switchAgent(name);
          this.config.activeAgent = name === 'default' ? undefined : name;
          void saveConfig(this.config);
          this.addSystemMessage(`Switched to agent: ${name}`);
          this.updateStatusBar();
        } catch (err) {
          this.addSystemMessage(`Error: ${(err as Error).message}`);
        }
      }
      this.ensureInputFocus();
      return;
    }

    if (raw.startsWith('/plan ')) {
      const task = raw.slice('/plan '.length).trim();
      if (!task) {
        this.addSystemMessage('Usage: /plan <task>');
        this.ensureInputFocus();
        return;
      }
      this.taskQueue.add(raw, { priority: 'high', type: 'plan' });
      void this.processQueue();
      this.ensureInputFocus();
      return;
    }

    if (raw.startsWith('/explore ')) {
      const task = raw.slice('/explore '.length).trim();
      if (!task) {
        this.addSystemMessage('Usage: /explore <query>');
        this.ensureInputFocus();
        return;
      }
      this.taskQueue.add(raw, { priority: 'high', type: 'explore' });
      void this.processQueue();
      this.ensureInputFocus();
      return;
    }

    if (raw.startsWith('/search ')) {
      const query = raw.slice('/search '.length).trim();
      if (!query) {
        this.addSystemMessage('Usage: /search <query>');
        this.ensureInputFocus();
        return;
      }
      this.taskQueue.add(raw, { type: 'search' });
      void this.processQueue();
      this.ensureInputFocus();
      return;
    }

    if (raw === '/yolo' || raw.startsWith('/yolo ')) {
      const arg = raw.slice('/yolo'.length).trim();
      const value = arg === 'on' ? true : arg === 'off' ? false : !this.permissionManager?.isYolo;
      this.permissionManager?.setYolo(value);
      this.config.yolo = value;
      void saveConfig(this.config);
      this.addSystemMessage(`YOLO mode ${value ? 'enabled' : 'disabled'}.`);
      this.updateStatusBar();
      this.ensureInputFocus();
      return;
    }

    if (raw === '/session' || raw.startsWith('/session ')) {
      void this.handleSessionCommand(raw);
      return;
    }

    if (raw === '/queue' || raw.startsWith('/queue ')) {
      this.handleQueueCommand(raw);
      return;
    }

    this.taskQueue.add(raw, { type: 'query' });
    void this.processQueue();
    this.ensureInputFocus();
  }

  private async processQueue(): Promise<void> {
    if (this.taskQueue.isBusy) {
      this.updateStatusBar();
      return;
    }
    if (this.taskQueue.size === 0) {
      this.updateStatusBar();
      return;
    }

    const task = this.taskQueue.startNext();
    if (!task) {
      this.updateStatusBar();
      return;
    }

    this.updateStatusBar();
    try {
      await this.runTask(task);
    } finally {
      this.taskQueue.finishCurrent();
      this.stopSpinner();
      this.currentAbortController = undefined;
    }
    this.maybeAutoCompact();
    this.updateStatusBar();
    this.ensureInputFocus();
    this.screen.render();

    void this.processQueue();
  }

  private async runTask(task: QueuedTask): Promise<void> {
    this.currentAbortController = new AbortController();
    this.startSpinner(this.getTaskLabel(task));

    try {
      if (task.type === 'query') {
        this.addUserMessage(task.text);
        const agent = this.getCurrentAgent();
        const answer = await agent.run(task.text, this.currentAbortController.signal);
        await this.streamResponse(answer);
        return;
      }

      if (task.type === 'plan' || task.type === 'explore') {
        const name = task.type;
        const subTask = task.text.slice(task.text.indexOf(' ') + 1).trim();
        await this.runSubAgentTask(name, subTask, this.currentAbortController.signal);
        return;
      }

      if (task.type === 'search') {
        const query = task.text.slice(task.text.indexOf(' ') + 1).trim();
        await this.runSearchTask(query);
        return;
      }
    } catch (err) {
      if ((err as Error).message === 'Thinking interrupted.') {
        this.addSystemMessage('Task interrupted.');
      } else {
        this.addSystemMessage(`Error: ${(err as Error).message}`);
      }
    } finally {
      this.currentAbortController = undefined;
      this.stopSpinner();
    }
  }

  private getTaskLabel(task: QueuedTask): string {
    if (task.type === 'query') {
      const preview = task.text.length > 24 ? `${task.text.slice(0, 24)}…` : task.text;
      return `Sage: ${preview}`;
    }
    if (task.type === 'plan') return 'Plan agent';
    if (task.type === 'explore') return 'Explore agent';
    if (task.type === 'search') return 'Searching';
    return 'Sage';
  }

  private maybeAutoCompact(): void {
    const stats = this.getCurrentAgent().getContextStats();
    if (stats.percentage >= 100) {
      const removed = this.getCurrentAgent().compact();
      const after = this.getCurrentAgent().formatContextIndicator();
      this.addSystemMessage(
        `Context limit reached. Auto-compacted: removed ${removed} messages. ${after}`,
      );
    }
  }

  private async runSearchTask(query: string, _signal?: AbortSignal): Promise<void> {
    this.addUserMessage(`/search ${query}`);

    try {
      const result = await searchCode({ query, maxResults: 50, contextLines: 2 });
      if (result.matches.length === 0) {
        this.addSystemMessage('No matches found.');
      } else {
        const lines = result.matches.map((m) => `${chalk.cyan(m.file)}:${m.line}\n${m.content}`);
        this.addSystemMessage(lines.join('\n\n'));
      }
    } catch (err) {
      this.addSystemMessage(`Search error: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------
  // Queue commands
  // ------------------------------------------------------------------

  private handleQueueCommand(raw: string): void {
    const args = raw.slice('/queue'.length).trim();

    if (!args || args === 'help') {
      this.addSystemMessage(
        'Queue commands:\n' +
          '  /queue list    List waiting and current tasks\n' +
          '  /queue clear   Clear all waiting tasks\n' +
          '  /queue cancel  Cancel the current task',
      );
      this.ensureInputFocus();
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
        this.addSystemMessage('Queue is empty.');
      } else {
        this.addSystemMessage('Task queue:\n' + lines.join('\n'));
      }
      this.ensureInputFocus();
      return;
    }

    if (args === 'clear') {
      const removed = this.taskQueue.clear();
      this.addSystemMessage(`Cleared ${removed} waiting task(s).`);
      this.updateStatusBar();
      this.ensureInputFocus();
      return;
    }

    if (args === 'cancel') {
      if (!this.taskQueue.isBusy) {
        this.addSystemMessage('No task is currently running.');
      } else {
        this.currentAbortController?.abort();
        this.addSystemMessage('Cancelling current task...');
      }
      this.ensureInputFocus();
      return;
    }

    this.addSystemMessage(`Unknown queue command: ${args}`);
    this.ensureInputFocus();
  }

  // ------------------------------------------------------------------
  // Session commands
  // ------------------------------------------------------------------

  private async handleSessionCommand(raw: string): Promise<void> {
    if (!this.sessionManager) {
      this.addSystemMessage('Session manager is not available.');
      this.ensureInputFocus();
      return;
    }

    const args = raw.slice('/session'.length).trim();

    if (!args || args === 'help') {
      this.addSystemMessage(
        'Session commands:\n' +
          '  /session list              List saved sessions\n' +
          '  /session save [title]      Save current session\n' +
          '  /session new [title]       Start a new session\n' +
          '  /session load <id>         Load a session\n' +
          '  /session fork <id> [title] Fork a session\n' +
          '  /session delete <id>       Delete a session',
      );
      this.ensureInputFocus();
      return;
    }

    const [subCommand, ...rest] = args.split(' ');

    try {
      if (subCommand === 'list') {
        const sessions = await this.sessionManager.list();
        if (sessions.length === 0) {
          this.addSystemMessage('No saved sessions.');
        } else {
          const lines = sessions.map((s) => {
            const marker = s.id === this.sessionManager?.currentId ? '*' : ' ';
            const date = new Date(s.updatedAt).toLocaleString();
            return `${marker} ${s.id} · ${s.title} · ${s.messageCount} msgs · ${date}`;
          });
          this.addSystemMessage('Saved sessions:\n' + lines.join('\n'));
        }
        this.ensureInputFocus();
        return;
      }

      if (subCommand === 'save') {
        const title = rest.join(' ').trim() || undefined;
        const session = await this.sessionManager.save(this.agent, title);
        this.addSystemMessage(`Session saved: ${session.id} · ${session.title}`);
        this.ensureInputFocus();
        return;
      }

      if (subCommand === 'new') {
        this.chatLines = [];
        this.renderChat();
        this.agent.importMessages([]);
        const title = rest.join(' ').trim() || undefined;
        const session = await this.sessionManager.create(this.agent, title);
        this.addSystemMessage(`New session started: ${session.id} · ${session.title}`);
        this.ensureInputFocus();
        return;
      }

      if (subCommand === 'load') {
        const id = rest.join(' ').trim();
        if (!id) {
          this.addSystemMessage('Usage: /session load <id>');
          this.ensureInputFocus();
          return;
        }
        const session = await this.sessionManager.load(id, this.agent);
        if (!session) {
          this.addSystemMessage(`Session not found: ${id}`);
        } else {
          this.chatLines = [];
          for (const m of session.messages) {
            if (m.role === 'user') this.addUserMessage(m.content);
            else if (m.role === 'assistant') this.addAssistantMessage(m.content);
            else if (m.role === 'system') this.addSystemMessage(`[system] ${m.content.slice(0, 80)}...`);
          }
          this.addSystemMessage(`Loaded session: ${session.id} · ${session.title}`);
        }
        this.ensureInputFocus();
        return;
      }

      if (subCommand === 'fork') {
        const parts = rest.join(' ').trim().split(/\s+/);
        const id = parts[0];
        const title = parts.slice(1).join(' ').trim() || undefined;
        if (!id) {
          this.addSystemMessage('Usage: /session fork <id> [title]');
          this.ensureInputFocus();
          return;
        }
        const session = await this.sessionManager.fork(id, this.agent, title);
        if (!session) {
          this.addSystemMessage(`Session not found: ${id}`);
        } else {
          this.chatLines = [];
          for (const m of session.messages) {
            if (m.role === 'user') this.addUserMessage(m.content);
            else if (m.role === 'assistant') this.addAssistantMessage(m.content);
            else if (m.role === 'system') this.addSystemMessage(`[system] ${m.content.slice(0, 80)}...`);
          }
          this.addSystemMessage(`Forked session: ${session.id} · ${session.title}`);
        }
        this.ensureInputFocus();
        return;
      }

      if (subCommand === 'delete') {
        const id = rest.join(' ').trim();
        if (!id) {
          this.addSystemMessage('Usage: /session delete <id>');
          this.ensureInputFocus();
          return;
        }
        const deleted = await this.sessionManager.delete(id);
        this.addSystemMessage(deleted ? `Deleted session: ${id}` : `Session not found: ${id}`);
        this.ensureInputFocus();
        return;
      }

      this.addSystemMessage(`Unknown session command: ${subCommand}`);
    } catch (err) {
      this.addSystemMessage(`Session error: ${(err as Error).message}`);
    } finally {
      this.updateStatusBar();
      this.ensureInputFocus();
      this.screen.render();
    }
  }

  // ------------------------------------------------------------------
  // Chat rendering
  // ------------------------------------------------------------------

  private addUserMessage(text: string): void {
    this.chatLines.push(`${chalk.cyan.bold('You')}  ${text}`);
    this.renderChat();
  }

  private addAssistantMessage(text: string): void {
    this.chatLines.push(`${chalk.green.bold('Sage')} ${text}`);
    this.renderChat();
  }

  private addSystemMessage(text: string): void {
    for (const line of text.split('\n')) {
      this.chatLines.push(chalk.gray(line));
    }
    this.renderChat();
  }

  private appendToLastAssistantMessage(chunk: string): void {
    const lastIndex = this.chatLines.length - 1;
    const prefix = `${chalk.green.bold('Sage')} `;
    if (lastIndex >= 0 && this.chatLines[lastIndex].startsWith(prefix)) {
      const current = this.chatLines[lastIndex].slice(prefix.length);
      this.chatLines[lastIndex] = prefix + current + chunk;
    } else {
      this.chatLines.push(prefix + chunk);
    }
    this.renderChat();
  }

  private renderChat(): void {
    this.chatBox.setContent(this.chatLines.join('\n'));
    this.chatBox.setScrollPerc(100);
    this.screen.render();
  }

  // ------------------------------------------------------------------
  // Streaming effect (character by character)
  // ------------------------------------------------------------------

  private async streamResponse(text: string): Promise<void> {
    this.startSpinner('Sage is responding');

    // Seed an empty assistant line.
    this.addAssistantMessage('');

    for (const char of text) {
      if (this.currentAbortController?.signal.aborted) {
        break;
      }
      await this.delay(20);
      this.appendToLastAssistantMessage(char);
    }

    this.stopSpinner();
    this.updateStatusBar();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ------------------------------------------------------------------
  // Status bar & spinner
  // ------------------------------------------------------------------

  private startSpinner(baseText: string): void {
    this.stopSpinner();
    this.spinnerInterval = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_FRAMES.length;
      this.updateStatusBar(`${baseText} ${SPINNER_FRAMES[this.spinnerIndex]}`);
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
  }

  private setStatus(text: string): void {
    this.updateStatusBar(text);
  }

  private formatQueueStatus(): string {
    const stats = this.taskQueue.stats();
    if (stats.current) {
      const total = stats.total;
      const preview =
        stats.current.text.length > 20 ? `${stats.current.text.slice(0, 20)}…` : stats.current.text;
      return `正在处理: ${preview} (1/${total})`;
    }
    if (stats.waiting.length > 0) {
      return `队列: ${stats.waiting.length} 个任务等待中`;
    }
    return '等待输入';
  }

  private updateStatusBar(extraStatus?: string): void {
    const entry = this.agent.currentEntry;
    const model = entry ? `${entry.provider}/${entry.model}` : 'no model';
    const cwd = path.basename(process.cwd());
    const git = this.gitBranch ? `${this.gitBranch}${this.gitDirty ? '*' : ''}` : 'no git';
    const role = this.agent.currentRole;
    const agent = this.currentAgentName;
    const yolo = this.permissionManager?.isYolo ?? false;

    let left = ` ${model} · ${cwd} · ${git}`;
    const context = this.getCurrentAgent().formatContextIndicator();
    const queueStatus = this.formatQueueStatus();
    let rightText = `${context} · ${queueStatus} · ${extraStatus ?? 'Ready'}`;
    if (agent !== 'default') {
      rightText += ` · ${agent}`;
    }
    if (role) {
      rightText += ` · ${role}`;
    }
    if (yolo) {
      rightText += ' · YOLO';
    }
    const right = ` ${rightText} `;

    const width = (this.screen.width as number | undefined) ?? 80;
    const available = Math.max(0, width - right.length);

    if (left.length > available) {
      left = left.slice(0, Math.max(0, available - 1)) + '…';
    }

    const pad = Math.max(1, width - left.length - right.length);
    this.statusBar.setContent(left + ' '.repeat(pad) + right);
    this.screen.render();
  }

  // ------------------------------------------------------------------
  // Login wizard (fullscreen compatible)
  // ------------------------------------------------------------------

  private async addProviderEntry(entry: ProviderEntry): Promise<void> {
    try {
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

      const newProvider = createProviderFromEntry(entry);
      this.agent.switchProvider(entry, newProvider);
      this.addSystemMessage(`Connected to "${entry.id}" (${entry.provider}/${entry.model})`);
    } catch (err) {
      this.addSystemMessage(`Saved but can't activate: ${(err as Error).message}`);
    }
    this.updateStatusBar();
    this.ensureInputFocus();
    this.screen.render();
  }

  private async doLogin(): Promise<void> {
    this.stopSpinner();
    const savedLines = [...this.chatLines];
    this.screen.destroy();
    console.clear();

    const entry = await runLoginWizard();

    if (entry) {
      this.resume(savedLines, '');
      await this.addProviderEntry(entry);
    } else {
      this.resume(savedLines, 'Login cancelled.');
    }
  }

  private resume(savedLines: string[], notice: string): void {
    this.buildScreen();
    this.bindKeys();
    this.chatLines = savedLines;
    if (notice) {
      this.addSystemMessage(notice);
    }
    this.updateStatusBar();
    this.ensureInputFocus();
    this.screen.render();
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  private quit(): void {
    if (this.quitting) return;
    this.quitting = true;
    this.stopSpinner();
    try {
      this.screen.destroy();
    } catch {
      // Screen may already be destroyed.
    }
    console.clear();
    console.log(chalk.cyan('Goodbye!'));
    process.exit(0);
  }
}
