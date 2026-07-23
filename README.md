# codelab-sage

**English | [中文](README.zh-CN.md)**

A terminal CLI agent distilled from the wisdom of Codelab.

`codelab-sage` runs in your terminal, understands natural language, and uses a large language model together with built-in tools to complete real engineering tasks: reading files, writing files, running shell commands, checking the weather, and more.

## Features

- 💬 Natural language task execution
- 🛠️ Built-in tools: `read_file`, `write_file`, `bash`, `weather`
- 🧠 ReAct reasoning loop: think → act → observe → answer
- 📚 Skill system: inject Codelab knowledge and custom guidelines into the system prompt
- 🔁 Interactive REPL mode for multi-turn conversations
- ⚙️ Layered configuration: defaults, config files, environment variables, CLI options
- 🔒 Safety confirmations for destructive actions

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

Use a specific model:

```bash
codelab-sage "Refactor this function" --model gpt-4o
```

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
  "confirmDestructive": true
}
```

### Environment variables

| Variable | Description |
| :--- | :--- |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_BASE_URL` | Custom base URL for OpenAI-compatible providers |
| `CODELAB_SAGE_MODEL` | Default model |
| `CODELAB_SAGE_LOG_LEVEL` | Log level: `silent`, `error`, `warn`, `info`, `verbose`, `debug` |
| `CODELAB_SAGE_SKILL_DIRS` | Comma-separated list of skill directories |

## Skills

Skills are Markdown files with YAML frontmatter that are injected into the system prompt.

```markdown
---
name: my-team-style
description: My team coding style
priority: 100
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
  -r, --repl               Enter interactive REPL mode
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

## License

MIT
