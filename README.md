# codelab-sage

**English | [中文](README.zh-CN.md)**

A terminal CLI agent distilled from the wisdom of Codelab.

`codelab-sage` runs in your terminal, understands natural language, and uses a large language model together with built-in tools to complete real engineering tasks: reading files, writing files, running shell commands, searching code, managing sessions, and more.

## Features

- 💬 Natural language task execution
- 🤖 Main Agent + specialized sub-agents: `coder`, `explore`, `plan`
- 🛠️ Built-in tools: `read_file`, `write_file`, `bash`, `weather`, `search_code`, `search_files`
- 🔌 MCP support: load external MCP servers via stdio
- 🧠 ReAct reasoning loop: think → act → observe → answer
- 📚 Skill system: inject Codelab knowledge and custom guidelines into the system prompt
- 🔁 Interactive REPL mode for multi-turn conversations (fullscreen blessed UI or simple line-based UI)
- 💾 Session persistence: save, load, fork, and list conversations
- 🤖 Multi-provider: OpenAI, Anthropic (Claude), Ollama, DeepSeek, and any OpenAI-compatible API
- 🔄 Runtime switching with `/login`, `/models`, `/model`, `/roles`, `/role`, `/agents`, `/agent`
- ⚙️ Layered configuration: defaults, config files, environment variables, CLI options
- 🚀 YOLO mode: skip confirmations with `--yolo` or `/yolo on`
- 🔒 Permission manager: global confirmations, per-tool config, and extra protection outside cwd

## Install

```bash
npm install -g codelab-sage
```

## Quick Start

Set your OpenAI API key:

```bash
export OPENAI_API_KEY=sk-...
```

Run a single task:

```bash
codelab-sage "Explain the contents of README.md"
```

Start an interactive session:

```bash
codelab-sage --repl
```

Use the simple line-based UI instead of the fullscreen UI:

```bash
codelab-sage --repl --simple
```

Manage providers in REPL:

```
sage> /login     # Add a new provider (OpenAI, Anthropic, Ollama, DeepSeek, custom)
sage> /models    # List all configured providers
sage> /model my-gpt4  # Switch to a different provider
```

Use a specific model:

```bash
codelab-sage "Refactor this function" --model gpt-4o
```

Activate a sub-agent:

```bash
codelab-sage --repl --agent coder
```

## Slash Commands

Inside the REPL you can use slash commands. Type `/` in the fullscreen UI to open the command menu.

> **Ctrl+C behavior**: press once while Sage is thinking to interrupt the current response; press twice within 1.5 seconds while idle to exit.
>
> **Fullscreen UI shortcuts**: `Ctrl+L` clear screen, `Tab` complete command, `↑/↓` browse history, `/` open command menu.

### System commands
- `/help` — Show help
- `/exit` — Quit
- `/clear` — Clear chat
- `/history` — Input history
- `/status` — Current status
- `/skills` — Loaded skills
- `/roles` — Available roles
- `/role <name>` — Switch role, `/role none` to clear

### Configuration commands
- `/models` — List providers
- `/model <id>` — Switch provider
- `/login` — Add a new provider
- `/ollama <apikey>` — Quick connect to local Ollama (default key: `ollama`)
- `/compact` — Compact conversation context

### Agent commands
- `/agents` — List available agents
- `/agent <name>` — Switch active agent (`default`, `coder`, `explore`, `plan`)
- `/plan <task>` — Run the plan agent once
- `/explore <query>` — Run the explore agent once

### Tool commands
- `/search <query>` — Search file contents
- `/yolo` — Toggle YOLO mode
- `/yolo on` / `/yolo off` — Explicitly enable/disable YOLO mode

### Queue commands
- `/queue list` — Show current and waiting tasks
- `/queue clear` — Clear all waiting tasks
- `/queue cancel` — Cancel the currently running task

### Session commands
- `/session save [title]` — Save current session
- `/session list` — List saved sessions
- `/session load <id>` — Load a session
- `/session fork <id> [title]` — Fork a session
- `/session delete <id>` — Delete a session
- `/session new [title]` — Start a new session

## Configuration

Configuration is resolved in this order (later overrides earlier):

1. Built-in defaults
2. `~/.codelab-sage/config.json`
3. `./.codelab-sage.json`
4. Environment variables
5. CLI options

Example `~/.codelab-sage/config.json`:

```json
{
  "model": "gpt-4o",
  "skillDirs": ["~/.codelab-sage/skills", "./skills"],
  "confirmDestructive": true,
  "yolo": false,
  "activeAgent": "coder",
  "activeRole": "architect",
  "contextLimit": 128000,
  "tools": {
    "bash": {
      "timeout": 30000,
      "requireConfirm": true
    },
    "write_file": {
      "requireConfirm": true
    }
  },
  "mcpServers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"]
    }
  ]
}
```

### Environment variables

| Variable | Description |
| :--- | :--- |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_BASE_URL` | Custom base URL for OpenAI-compatible providers |
| `CODELAB_SAGE_MODEL` | Default model |
| `CODELAB_SAGE_CONTEXT_LIMIT` | Context window limit in tokens, default `128000` |
| `CODELAB_SAGE_LOG_LEVEL` | Log level: `silent`, `error`, `warn`, `info`, `verbose`, `debug` |
| `CODELAB_SAGE_SKILL_DIRS` | Comma-separated list of skill directories |

## Agents

Built-in sub-agents filter tools and skills for specialized tasks:

| Agent | Focus | Tools |
| :--- | :--- | :--- |
| `default` | General task assistant | All tools |
| `coder` | Code generation, refactoring, review | `read_file`, `write_file`, `bash`, `search_code`, `search_files` |
| `explore` | Codebase navigation and explanation | `read_file`, `bash`, `search_code`, `search_files` |
| `plan` | Task planning and breakdown | `read_file`, `search_code`, `search_files` |

Activate an agent with `--agent <name>` or `/agent <name>` in the REPL.

## Session Persistence

Sessions are saved as JSON files in `~/.codelab-sage/sessions/`. Each session stores the full conversation, active provider, role, agent, and working directory.

```
sage> /session save my-project   # Save current conversation
sage> /session list              # Show all saved sessions
sage> /session load 20260723-abcd # Restore a session
sage> /session fork 20260723-abcd copy # Duplicate a session
```

## YOLO Mode

When YOLO mode is enabled, all destructive confirmations are skipped.

```bash
codelab-sage --repl --yolo
```

Or toggle inside the REPL:

```
sage> /yolo on
sage> /yolo off
```

## MCP Servers

Add MCP servers to your config to expose their tools to the agent. Each tool is registered as `{serverName}_{toolName}`.

See the [Configuration](#configuration) example above.

## Skills

Skills are Markdown files with YAML frontmatter that are injected into the system prompt.

```markdown
---
name: my-team-style
description: My team coding style
priority: 100
role: coder
tags: [typescript]
---

# My Team Style

- Use `const` by default.
- Prefer explicit error handling.
```

Place them in `~/.codelab-sage/skills/` or a directory specified with `--skill-dir`.

## CLI Options

```
Usage: codelab-sage [options] [query]

Options:
  -m, --model <model>      Model to use
  -s, --skill-dir <dir>    Add a custom skill directory
  -c, --config <path>      Path to config file
  -r, --repl               Enter interactive chat mode
  --simple                 Use the simple line-based REPL instead of fullscreen
  --role <role>            Activate a specific role
  --agent <agent>          Activate a specific sub-agent
  --yolo                   Skip all destructive confirmations
  -v, --verbose            Enable verbose logging
  --no-confirm             Disable confirmation for destructive actions
  -k, --api-key <key>      API key (use environment variable instead)
  -V, --version            Show version number
  -h, --help               Show help
```

## Development

```bash
pnpm install
pnpm dev -- --repl
pnpm test
pnpm build
pnpm lint
pnpm format
```

## Architecture

See [`docs/technical-design.md`](docs/technical-design.md) for the full technical design.

## Docs

- [Technical Design](docs/technical-design.md) — Architecture & design
- [Skill Authoring Guide](docs/skill-authoring.md) — How to write custom Skills
- [Contributing Guide](docs/contributing.md) — How to contribute

## License

MIT
