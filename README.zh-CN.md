# codelab-sage

**[English](README.md) | 中文**

一个凝聚了 Codelab 智慧的终端 CLI 智能体。

`codelab-sage` 运行在终端中，能够理解自然语言，并借助大语言模型和内置工具完成真实的工程任务：读取文件、写入文件、运行 shell 命令、搜索代码、管理会话等。

## 特性

- 💬 自然语言任务执行
- 🤖 主 Agent + 子 Agent：`coder`、`explore`、`plan`
- 🛠️ 内置工具：`read_file`、`write_file`、`bash`、`weather`、`search_code`、`search_files`
- 🔌 MCP 支持：通过 stdio 加载外部 MCP 服务器
- 🧠 ReAct 推理循环：思考 → 行动 → 观察 → 回答
- 📚 Skill 系统：将 Codelab 知识与自定义规范注入系统提示词
- 🔁 交互式 REPL 模式，支持多轮对话（全屏 blessed UI 或简单行模式）
- 💾 会话持久化：保存、加载、复刻、列出对话
- 🤖 多模型支持：OpenAI、Anthropic (Claude)、Ollama、DeepSeek 以及任意 OpenAI 兼容 API
- 🔄 运行时切换：`/login`、`/models`、`/model`、`/roles`、`/role`、`/agents`、`/agent`
- ⚙️ 分层配置：默认值、配置文件、环境变量、CLI 选项
- 🚀 YOLO 模式：通过 `--yolo` 或 `/yolo on` 跳过所有确认
- 🔒 权限管理：全局确认、按工具配置、工作目录外额外保护

## 安装

```bash
npm install -g codelab-sage
```

## 快速开始

设置你的 OpenAI API 密钥：

```bash
export OPENAI_API_KEY=sk-...
```

执行单个任务：

```bash
codelab-sage "解释 README.md 的内容"
```

启动交互式会话：

```bash
codelab-sage --repl
```

使用简单行模式替代全屏 UI：

```bash
codelab-sage --repl --simple
```

在 REPL 中管理模型提供方：

```
sage> /login       # 添加新的 provider（OpenAI、Anthropic、Ollama、DeepSeek、自定义）
sage> /models      # 列出所有已配置的 provider
sage> /model my-gpt4  # 切换到指定的 provider
```

使用指定模型：

```bash
codelab-sage "重构这个函数" --model gpt-4o
```

激活子 Agent：

```bash
codelab-sage --repl --agent coder
```

## 斜杠命令

在 REPL 中可以使用斜杠命令。在全屏 UI 中输入 `/` 即可打开命令菜单。

> **Ctrl+C 行为**：Sage 思考时按一次可打断当前回复；空闲时 1.5 秒内连续按两次退出。
> 
> **全屏 UI 快捷键**：`Ctrl+L` 清屏、`Tab` 补全命令、`↑/↓` 浏览历史、`/` 打开命令菜单。

### 系统命令
- `/help` — 显示帮助
- `/exit` — 退出
- `/clear` — 清空对话
- `/history` — 输入历史
- `/status` — 当前状态
- `/skills` — 已加载技能
- `/roles` — 可用角色
- `/role <name>` — 切换角色，`/role none` 清除角色

### 配置命令
- `/models` — 列出 provider
- `/model <id>` — 切换 provider
- `/login` — 添加 provider
- `/ollama <apikey>` — 快速接入本地 Ollama（默认 key：`ollama`）
- `/compact` — 压缩对话上下文

### Agent 命令
- `/agents` — 列出可用 Agent
- `/agent <name>` — 切换 Agent（`default`、`coder`、`explore`、`plan`）
- `/plan <task>` — 一次性调用 plan agent
- `/explore <query>` — 一次性调用 explore agent

### 工具命令
- `/search <query>` — 搜索代码
- `/yolo` — 切换 YOLO 模式
- `/yolo on` / `/yolo off` — 显式启用/禁用 YOLO 模式

### 队列命令
- `/queue list` — 显示当前及等待中的任务
- `/queue clear` — 清空所有等待中的任务
- `/queue cancel` — 取消正在执行的任务

### 会话命令
- `/session save [title]` — 保存当前会话
- `/session list` — 列出保存的会话
- `/session load <id>` — 加载会话
- `/session fork <id> [title]` — 复刻会话
- `/session delete <id>` — 删除会话
- `/session new [title]` — 新建会话

## 配置

配置按以下优先级解析（后者覆盖前者）：

1. 内置默认值
2. `~/.codelab-sage/config.json`
3. `./.codelab-sage.json`
4. 环境变量
5. CLI 选项

示例 `~/.codelab-sage/config.json`：

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

### 环境变量

| 变量 | 说明 |
| :--- | :--- |
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `OPENAI_BASE_URL` | OpenAI 兼容提供商的自定义 base URL |
| `CODELAB_SAGE_MODEL` | 默认模型 |
| `CODELAB_SAGE_CONTEXT_LIMIT` | 上下文窗口上限（token 数），默认 `128000` |
| `CODELAB_SAGE_LOG_LEVEL` | 日志级别：`silent`、`error`、`warn`、`info`、`verbose`、`debug` |
| `CODELAB_SAGE_SKILL_DIRS` | Skill 目录列表，用逗号分隔 |

## Agent

内置子 Agent 会针对特定任务过滤工具和 Skill：

| Agent | 定位 | 可用工具 |
| :--- | :--- | :--- |
| `default` | 通用任务助手 | 全部工具 |
| `coder` | 代码生成、重构、审查 | `read_file`、`write_file`、`bash`、`search_code`、`search_files` |
| `explore` | 代码库导航与解释 | `read_file`、`bash`、`search_code`、`search_files` |
| `plan` | 任务规划与拆解 | `read_file`、`search_code`、`search_files` |

通过 `--agent <name>` 或 REPL 中的 `/agent <name>` 激活。

## 会话持久化

会话以 JSON 文件形式保存在 `~/.codelab-sage/sessions/`。每个会话保存完整对话、当前 provider、角色、Agent 和工作目录。

```
sage> /session save my-project   # 保存当前对话
sage> /session list              # 列出所有会话
sage> /session load 20260723-abcd # 恢复会话
sage> /session fork 20260723-abcd copy # 复刻会话
```

## YOLO 模式

启用 YOLO 模式后，所有破坏性确认都会被跳过。

```bash
codelab-sage --repl --yolo
```

或在 REPL 中切换：

```
sage> /yolo on
sage> /yolo off
```

## MCP 服务器

在配置中添加 MCP 服务器后，它们的工具会暴露给 Agent。每个工具注册为 `{serverName}_{toolName}`。

示例见上方[配置](#配置)章节。

## Skills

Skills 是带有 YAML frontmatter 的 Markdown 文件，会被注入到系统提示词中。

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

将它们放在 `~/.codelab-sage/skills/` 或用 `--skill-dir` 指定的目录中。

## CLI 选项

```
Usage: codelab-sage [options] [query]

Options:
  -m, --model <model>      要使用的模型
  -s, --skill-dir <dir>    添加自定义 skill 目录
  -c, --config <path>      配置文件路径
  -r, --repl               进入交互式对话模式
  --simple                 使用简单行模式 REPL，而非全屏 UI
  --role <role>            激活指定角色
  --agent <agent>          激活指定子 Agent
  --yolo                   跳过所有破坏性确认
  -v, --verbose            启用详细日志
  --no-confirm             禁用破坏性操作的确认
  -k, --api-key <key>      API 密钥（建议使用环境变量）
  -V, --version            显示版本号
  -h, --help               显示帮助信息
```

## 开发

```bash
pnpm install
pnpm dev -- --repl
pnpm test
pnpm build
pnpm lint
pnpm format
```

## 架构

完整的技术设计见 [`docs/technical-design.md`](docs/technical-design.md)。

## 文档

- [技术设计](docs/technical-design.md) — 完整技术设计
- [Skill 编写指南](docs/skill-authoring.md) — 如何编写自定义 Skill
- [贡献指南](docs/contributing.md) — 如何参与项目贡献

## 许可证

MIT
