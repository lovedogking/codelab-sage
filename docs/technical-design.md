# codelab-sage 技术设计文档

> 版本：v1.2
> 作者：Codelab 技术架构组
> 日期：2026-07-21（初稿）、2026-07-23（修订）
> 状态：已实现 / v0.6.0 可用

---

## 第一章：项目概述

### 1.1 项目背景与动机

Codelab 组织在长期的项目实践中沉淀了大量方法论、编码规范、架构经验与社区文化。这些知识通常以博客、Wiki、会议记录、代码库约定等形式存在，分散且难以在编码现场被即时调用。随着大语言模型（LLM）能力的成熟，我们希望把这些“集体智慧”蒸馏成结构化的 Skill 文件，注入一个终端 CLI Agent 的 System Prompt，让用户在日常开发中只需通过自然语言与终端交互，就能获得符合 Codelab 风格的建议、代码审查、自动化操作与问题诊断。

`codelab-sage` 因此而生。它不仅仅是一个命令行对话工具，更是 Codelab 历代先祖经验的“数字化身”。它在终端中运行，贴近工程师的实际工作场景；它通过调用大模型完成推理，并借助内置工具真正去读写文件、执行命令、查询外部信息，从而把“知道”转化为“做到”。

### 1.2 目标用户

| 用户群体 | 典型场景 | 核心诉求 |
| :--- | :--- | :--- |
| CLI 工具使用者 | 在终端里快速生成代码、执行脚本、查询文档 | 低门槛、响应快、结果可直接落地 |
| 开源贡献者 | 参与 codelab-sage 开发，扩展 Skill 或工具 | 代码清晰、插件化、文档完善 |
| Codelab 组织成员 | 按照组织规范写代码、做 Code Review、排查问题 | 得到符合组织文化的建议，传承最佳实践 |
| 普通开发者 | 学习 Codelab 方法论，获得项目级辅导 | 可复用、可验证、可交互 |

### 1.3 核心功能列表

- **自然语言对话**：用户通过终端输入自然语言指令，Agent 理解意图并给出回答。
- **主 Agent + 子 Agent**：内置 `coder`、`explore`、`plan` 子 Agent，可按定义过滤工具与 Skill。
- **ReAct 推理循环**：支持“思考 → 行动（工具调用）→ 观察 → 再思考”的多轮循环，直到任务完成。
- **内置工具系统**：提供 `read_file`、`write_file`、`bash`、`weather`、`search_code`、`search_files`，并支持 MCP 外部工具扩展。
- **Skill 注入**：从本地加载 Markdown 格式的 Skill 文件，融合进 System Prompt，支持按 `role` 与 `tags` 过滤。
- **交互式 REPL 模式**：持续对话，保留上下文，支持全屏 blessed UI 与简单行模式两种界面。
- **单条命令模式**：直接通过 `codelab-sage <query>` 完成任务后退出。
- **配置与鉴权**：支持 API Key 管理、多 provider、模型选择、自定义 Skill 目录、日志级别等。
- **权限与 YOLO 模式**：支持全局确认、按工具类型配置、工作目录外额外保护，以及 `/yolo` 跳过确认。
- **会话持久化**：完整对话可保存、加载、复刻、列出，存储在 `~/.codelab-sage/sessions/`。
- **MCP 支持**：可通过 stdio 加载外部 MCP 服务器，将 MCP 工具注册为 `{serverName}_{toolName}`。

### 1.4 项目愿景

成为 Codelab 组织成员与广大开发者口袋里的“终端智囊”。在保持工具轻量、可扩展、开发者友好的前提下，让 Codelab 的编码哲学、架构经验与文化气质，通过大模型能力渗透进每一次代码生成、每一轮代码审查、每一次问题排查。

---

## 第二章：技术选型

### 2.1 运行环境

- **Node.js 版本**：建议 `>= 18.0.0`，推荐 LTS 版本（Node 20+）。
  - 理由：Node 18 起原生支持 `fetch`，可减少外部依赖；`fs/promises`、`stream` 等现代 API 成熟稳定；LTS 版本生命周期长，适合开源项目。
- **包管理器**：推荐 `pnpm`，也兼容 `npm` 与 `yarn`。
- **操作系统**：跨平台，优先支持 macOS、Linux、Windows（Git Bash / WSL / PowerShell）。

### 2.2 开发语言选择

**选择 TypeScript。**

理由如下：

1. **类型安全**：CLI Agent 内部有较多数据结构（工具 schema、消息格式、Skill 元数据、配置对象），类型系统可显著降低运行时错误。
2. **开发者体验**：现代 IDE 对 TypeScript 的自动补全、重构、跳转支持远优于 JavaScript，利于开源贡献者上手。
3. **可维护性**：项目生命周期长，类型即文档，能够降低后续维护成本。
4. **生态对齐**：主流 LLM SDK（OpenAI、Anthropic 等）均提供官方 TypeScript 类型定义，可直接复用。
5. **编译产物**：通过 `tsc` 编译为 JavaScript 后发布到 npm，终端用户无需感知 TypeScript。

### 2.3 核心技术依赖

| 依赖 | 用途 | 选型理由 |
| :--- | :--- | :--- |
| `commander` | CLI 参数解析与子命令 | 社区最成熟的 Node CLI 框架，文档丰富，支持选项、子命令、帮助生成 |
| `chalk` | 终端颜色与样式 | 轻量、跨平台、类型定义完善 |
| `ora` | 加载动画 | 在模型推理或工具执行时提供视觉反馈，简洁易用 |
| `inquirer` / `@inquirer/prompts` | 交互式提示（确认、选择、输入） | 用于危险操作确认、配置向导、REPL 输入增强 |
| `dotenv` | 读取 `.env` 文件中的环境变量 | 开发阶段管理 API Key 的标准方案 |
| `openai` | 大模型接入层（首版） | 官方 SDK，Function Calling / Tool Calling 支持成熟，TypeScript 类型完整 |
| `zod` | 运行时报验与 schema 定义 | 用于工具参数校验、配置校验、Skill 元数据校验，可推导 TypeScript 类型 |
| `yaml` | 解析 Skill 文件 frontmatter | 支持 YAML 元数据头，生态成熟 |
| `fs-extra` | 增强文件系统操作 | 提供 `readFile`、`writeFile`、`ensureDir` 等 Promise API，减少样板代码 |
| `node-fetch`（备选） | HTTP 请求（如天气 API） | Node 18+ 已内置 `fetch`，仅在低版本兜底使用 |
| `vitest` | 单元测试与集成测试 | 速度快、原生 TS 支持、与 Vite 生态一致 |
| `eslint` + `prettier` | 代码规范与格式化 | TypeScript 项目标配，保持代码风格一致 |

> 注：首版以 OpenAI 兼容协议为主，后续通过抽象层支持 Anthropic、Ollama、本地模型等。

---

## 第三章：架构设计

### 3.1 整体架构图

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                用户终端                                       │
│  ┌──────────────┐    ┌─────────────────────┐    ┌──────────────────────────┐ │
│  │ 单条命令模式  │    │ 交互式 REPL（全屏/行模式）│    │ 配置 / 帮助 / 版本信息    │ │
│  └──────┬───────┘    └──────────┬──────────┘    └──────────────────────────┘ │
└─────────┼───────────────────────┼──────────────────────────────────────────────┘
          │                       │
          └───────────┬───────────┘
                      ▼
            ┌─────────────────────┐
            │     CLI 入口模块     │   commander 解析参数，分发执行模式
            └──────────┬──────────┘
                       ▼
            ┌─────────────────────┐
            │   Agent 核心循环     │   ReAct：思考 → 工具调用 → 观察 → 再思考
            │   (Agent Core Loop)  │
            └──────────┬──────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌─────────────┐ ┌──────────┐ ┌──────────────┐ ┌─────────────┐
│ 大模型接入层 │ │ 工具系统  │ │ Skill 加载系统 │ │  子 Agent   │
│   LLM Layer │ │  Tools   │ │ Skill Loader │ │   Factory   │
└─────────────┘ └────┬─────┘ └──────────────┘ └─────────────┘
        ▲            │            ▲
        │            ▼            │
        │    ┌─────────────────┐  │
        └────┤ 配置 / 权限 / MCP ├──┘
             │ Config / Perm / │
             │     MCP Loader  │
             └─────────────────┘
```

### 3.2 核心模块划分

#### 3.2.1 CLI 入口模块

- **职责**：解析命令行参数、初始化日志与配置、决定进入单条命令模式还是 REPL 模式、输出帮助信息。交互模式下支持两种 UI：行模式 ChatTUI（基于 `@inquirer/prompts`）和全屏 FullscreenUI（基于 `blessed`）。
- **关键文件**：`src/cli/index.ts`、`src/cli/chat-ui.ts`、`src/cli/fullscreen-ui.ts`、`src/cli/login-wizard.ts`、`src/cli/task-queue.ts`。
- **输入**：`process.argv`、环境变量、配置文件。
- **输出**：调用 Agent 核心循环或打印版本/帮助信息。

#### 3.2.2 Agent 核心循环模块

- **职责**：实现 ReAct 推理循环。维护对话历史，接收用户输入，构建 System Prompt，与大模型交互，解析模型响应中的工具调用，调度工具执行，并将结果回送给模型，直到获得最终答案或达到最大轮次。
- **关键文件**：`src/agent/agent.ts`、`src/agent/loop.ts`。
- **核心对象**：
  - `Agent`：循环控制器。
  - `Message`：符合 OpenAI Chat Completions 格式的消息数组。
  - `ToolCall` / `ToolResult`：工具调用请求与执行结果。

#### 3.2.3 大模型接入层

- **职责**：封装不同 LLM Provider 的差异，对外提供统一的 `chat(messages, tools)` 接口。首版实现 OpenAI 兼容协议，预留 Anthropic、Ollama、本地模型的扩展点。
- **关键文件**：`src/llm/provider.ts`、`src/llm/openai-provider.ts`。
- **设计要点**：
  - 抽象 `LLMProvider` 接口。
  - 统一工具描述格式（OpenAI function schema）。
  - 错误重试、限流、超时控制。

#### 3.2.4 工具系统（Tools）

- **职责**：注册、调度、执行具体工具。每个工具包含名称、描述、参数 schema、执行函数。支持工具权限、确认机制与结果格式化。
- **关键文件**：`src/tools/registry.ts`、`src/tools/executor.ts`、`src/tools/definitions/*.ts`。
- **内置工具**：
  - `read_file`：读取文件内容。
  - `write_file`：写入或追加文件内容。
  - `bash`：执行本地 shell 命令。
  - `weather`：查询指定城市天气（基于 Open-Meteo 等公开 API）。
  - `search_code`：搜索文件内容（优先 ripgrep，降级 Node.js）。
  - `search_files`：按文件名搜索。
- **MCP 工具**：外部 MCP 服务器提供的工具注册为 `{serverName}_{toolName}`。

#### 3.2.5 子 Agent 系统（AgentFactory）

- **职责**：根据 `AgentDefinition` 创建专业化的子 Agent。子 Agent 可继承父 Agent 的部分上下文，并仅使用指定的工具和 Skill。
- **关键文件**：`src/agent/agent-factory.ts`、`src/agent/types.ts`、`src/agents/builtins/*.ts`。
- **内置 Agent**：`coder`、`explore`、`plan`。

#### 3.2.6 会话持久化（SessionManager）

- **职责**：保存、加载、复刻、列出会话。会话以 JSON 文件存储在 `~/.codelab-sage/sessions/`。
- **关键文件**：`src/session/manager.ts`、`src/session/store.ts`、`src/session/types.ts`。

#### 3.2.7 权限管理（PermissionManager）

- **职责**：决定工具执行前是否需要二次确认。支持全局 YOLO 模式、按工具配置、工作目录外额外保护。
- **关键文件**：`src/permissions/manager.ts`。

#### 3.2.8 MCP 加载器（McpLoader）

- **职责**：通过 stdio 启动外部 MCP 服务器，完成 `initialize`、`tools/list`，并将工具注册到 `ToolRegistry`。
- **关键文件**：`src/mcp/client.ts`、`src/mcp/adapter.ts`、`src/mcp/loader.ts`、`src/mcp/types.ts`。

#### 3.2.9 Skill 加载系统

- **职责**：扫描指定目录下的 Skill 文件（Markdown + YAML frontmatter），解析元数据、正文、示例，将其按优先级拼接进 System Prompt。支持本地 Skill 目录与通过 npm 包分发的 Skill。
- **关键文件**：`src/skills/loader.ts`、`src/skills/skill.ts`。
- **核心概念**：
  - `Skill`：单个经验包。
  - `SkillManifest`：元数据（名称、版本、作者、标签、激活条件）。
  - `SkillLoader`：扫描、过滤、排序、拼接。

#### 3.2.10 配置管理模块

- **职责**：管理运行时配置，包括 API Key、默认模型、Skill 目录、日志级别、是否开启确认提示等。支持多层级配置覆盖：默认值 < 配置文件 < 环境变量 < 命令行参数。
- **关键文件**：`src/config/config.ts`、`src/config/schema.ts`。
- **存储位置**：`~/.codelab-sage/config.json`（用户级），项目级 `.codelab-sage.json`（可选）。

#### 3.2.11 工具函数模块

- **职责**：提供跨模块使用的通用工具函数。
- **关键文件**：
  - `src/utils/logger.ts`：日志输出。
  - `src/utils/errors.ts`：统一错误类型。
  - `src/utils/git.ts`：检测 Git 分支与工作区状态（用于状态栏显示）。
  - `src/utils/context.ts`：Token 估算与上下文使用量计算。
  - `src/utils/search.ts`：封装 ripgrep 代码搜索、glob 文件搜索。

---

## 第四章：功能规格

### 4.1 CLI 命令用法

```bash
# 安装
npm install -g codelab-sage

# 单条命令模式
codelab-sage "帮我写一个读取 JSON 文件的 Node.js 函数"

# 指定模型
codelab-sage "解释这段代码" --model gpt-4o

# 使用自定义 Skill 目录
codelab-sage "按 Codelab 规范重构这个函数" --skill-dir ./my-skills

# 交互式 REPL
codelab-sage --repl

# 配置文件路径
codelab-sage --config ~/.codelab-sage/config.json

# 开启详细日志
codelab-sage "排查 build 失败原因" --verbose

# 显示版本与帮助
codelab-sage --version
codelab-sage --help
```

#### 4.1.1 完整选项列表

| 选项 | 简写 | 参数 | 说明 |
| :--- | :--- | :--- | :--- |
| `--model` | `-m` | `string` | 选择大模型，例如 `gpt-4o`、`gpt-3.5-turbo` |
| `--skill-dir` | `-s` | `path` | 自定义 Skill 目录，可多次指定 |
| `--config` | `-c` | `path` | 指定配置文件路径 |
| `--repl` | `-r` | 无 | 进入交互式对话模式 |
| `--simple` | 无 | 无 | 使用简单行模式 REPL，而非全屏 UI |
| `--role` | 无 | `string` | 激活指定角色 |
| `--agent` | 无 | `string` | 激活指定子 Agent |
| `--yolo` | 无 | 无 | 跳过所有破坏性确认 |
| `--verbose` | `-v` | 无 | 输出详细日志（请求体、工具调用参数等） |
| `--no-confirm` | 无 | 无 | 禁用 `write_file` 覆盖确认（谨慎使用） |
| `--api-key` | `-k` | `string` | 通过命令行传入 API Key（不推荐，仅调试） |
| `--version` | `-V` | 无 | 显示版本号 |
| `--help` | `-h` | 无 | 显示帮助信息 |

### 4.2 Agent 循环的工作流程（ReAct 模式）

1. **初始化**：加载配置、Skill、工具注册表，构建 System Prompt。
2. **接收输入**：用户输入自然语言任务。
3. **构建消息**：将 System Prompt + 历史消息 + 当前用户消息发送给 LLM。
4. **模型推理**：LLM 返回文本或 `tool_calls`。
5. **分支处理**：
   - 若只有文本：直接输出给用户。
   - 若包含工具调用：依次执行工具，收集结果。
6. **结果回送**：将工具调用 ID、参数、执行结果以 `tool` 消息形式追加到历史。
7. **循环**：再次调用 LLM，直到获得最终文本答案或达到最大循环次数。
8. **结束**：输出最终答案，可选保存对话历史。

```
用户输入
   │
   ▼
┌─────────────┐
│ 组装消息    │
└──────┬──────┘
       ▼
┌─────────────┐
│ 调用 LLM    │
└──────┬──────┘
       ▼
   是否包含工具调用？
   /          \
  是          否
  │            │
  ▼            ▼
执行工具    输出最终答案
  │            │
  ▼            │
回送结果      │
  │            │
  └──────┬─────┘
         ▼
      返回调用 LLM
```

### 4.3 工具列表

#### 4.3.1 `read_file`

- **用途**：读取本地文件内容。
- **参数**：
  - `path`（string，必填）：文件相对或绝对路径。
  - `encoding`（string，可选）：编码，默认 `utf-8`。
  - `limit`（number，可选）：最多读取行数，用于大文件安全。
- **返回值**：文件内容或错误信息。
- **安全**：禁止读取常见敏感文件（如 `.env`、SSH 私钥），读取前进行路径规范化与权限校验。

#### 4.3.2 `write_file`

- **用途**：写入或追加文件内容。
- **参数**：
  - `path`（string，必填）。
  - `content`（string，必填）。
  - `append`（boolean，可选）：是否追加，默认 `false`。
- **安全**：默认对覆盖已有文件进行二次确认；可通过 `--no-confirm` 关闭。

#### 4.3.3 `bash`

- **用途**：执行本地 shell 命令。
- **参数**：
  - `command`（string，必填）。
  - `cwd`（string，可选）：工作目录。
  - `timeout`（number，可选）：超时毫秒数。
- **安全**：
  - 默认拒绝 `rm -rf /` 等危险命令。
  - 可配置命令白名单/黑名单。
  - 默认对命令执行进行二次确认，YOLO 模式跳过。

#### 4.3.4 `weather`

- **用途**：查询指定城市的实时天气。
- **参数**：
  - `city`（string，必填）。
  - `units`（string，可选）：`metric` 或 `imperial`，默认 `metric`。
- **实现**：调用 Open-Meteo Geocoding + Forecast API，无需 API Key。
- **返回值**：温度、天气状况、风速等。

#### 4.3.5 `search_code`

- **用途**：搜索文件内容。
- **参数**：
  - `query`（string，必填）：要搜索的文本或正则。
  - `path`（string，可选）：搜索范围。
  - `filePattern`（string，可选）：文件 glob 过滤。
  - `caseSensitive`（boolean，可选）。
  - `contextLines`（number，可选）：匹配行上下文。
  - `maxResults`（number，可选）。
- **实现**：优先使用 `ripgrep`，不可用时降级为 Node.js 遍历。

#### 4.3.6 `search_files`

- **用途**：按文件名搜索。
- **参数**：
  - `query`（string，必填）。
  - `path`（string，可选）。
  - `maxResults`（number，可选）。
- **实现**：优先使用 `ripgrep --files`，不可用时降级为 Node.js 遍历。

> **跨平台适配**：bash 工具在 Windows 上自动使用 `cmd.exe`（或 `ComSpec` 环境变量指定的 shell），在 Unix 上使用 `bash -c`，无需用户手动配置。

### 4.4 Skill 系统的设计

#### 4.4.1 Skill 文件格式

Skill 文件采用 Markdown 格式，顶部使用 YAML frontmatter 描述元数据，正文为自由文本，可包含规则、示例、约束、价值观等。

```markdown
---
name: codelab-code-review
description: Codelab 代码审查规范
version: 1.0.0
author: codelab-core
tags: [code-review, typescript]
priority: 100
---

# Codelab 代码审查规范

## 核心原则

1. 代码必须可读，优先使用显式命名而非注释解释。
2. 避免过早抽象，三个相似用例出现后再考虑抽象。
3. 错误处理要明确，不要吞掉异常。

## 审查清单

- 是否处理了所有异步错误？
- 是否有可复用的工具函数被重复实现？
- 是否引入了不必要的外部依赖？

## 示例

```typescript
// 不推荐
const x = await fetch(url);

// 推荐
const response = await fetch(url);
if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}
```
```

#### 4.4.2 加载方式

- **本地目录扫描**：默认扫描 `~/.codelab-sage/skills/` 与项目内 `./skills/`（如果存在）。
- **命令行指定**：通过 `--skill-dir` 追加自定义目录。
- **npm 包分发**：Skill 可以发布为 `@codelab-sage/skill-*` 包，安装后通过配置激活。
- **过滤与排序**：根据 `tags`、`priority`、`activation` 条件过滤，按 `priority` 降序拼接。

#### 4.4.3 与 System Prompt 的融合方式

System Prompt 的结构如下：

```
你是 codelab-sage，Codelab 组织的终端智能助手。

[基础行为约束]
- 你只能使用系统提供的工具完成任务。
- 对危险操作必须先请求确认，除非用户明确关闭确认。
- 使用中文回复，除非用户要求其他语言。

[Skill 1 名称]
Skill 1 正文...

[Skill 2 名称]
Skill 2 正文...

[工具描述]
以 OpenAI function schema 格式列出所有可用工具。
```

Skill 内容按顺序追加到基础提示之后，形成最终的 System Prompt。高优先级的 Skill 排在前面，确保其规则更可能被模型遵循。

### 4.5 交互式对话模式的设计（REPL / ChatTUI）

直接运行 `codelab-sage`（不带参数）即进入交互式聊天界面。界面使用 `@inquirer/prompts` 驱动输入循环，保证在 Windows PowerShell、cmd、Windows Terminal、macOS、Linux 等终端上稳定工作。输出部分使用 `chalk` 美化：消息以带颜色、分隔线的卡片形式展示，模型思考时显示 `ora` 加载动画。

支持的命令：

| 命令 | 说明 |
| :--- | :--- |
| `/exit` | 退出 |
| `/clear` | 清空当前会话上下文 |
| `/login` | 交互式添加新的模型提供方 |
| `/ollama <apikey>` | 快速接入本地 Ollama（默认 key：`ollama`） |
| `/compact` | 压缩对话上下文（丢弃最旧 exchanges，保留系统提示与最新对话） |
| `/models` | 列出当前所有已配置的模型提供方 |
| `/model <name>` | 切换到指定提供方 |
| `/roles` | 列出可用角色 |
| `/role <name>` | 切换角色 |
| `/agents` | 列出可用 Agent |
| `/agent <name>` | 切换子 Agent |
| `/plan <task>` | 调用 plan agent |
| `/explore <query>` | 调用 explore agent |
| `/search <query>` | 搜索代码 |
| `/yolo on/off` | 切换 YOLO 模式 |
| `/history` | 查看输入历史 |
| `/status` | 查看当前状态（模型、Agent、角色、Git 分支等） |
| `/skills` | 列出已加载的 Skill（含角色标注） |
| `/queue list` | 显示任务队列 |
| `/queue clear` | 清空等待中的任务 |
| `/queue cancel` | 取消正在执行的任务 |
| `/session ...` | 会话管理（save/list/load/fork/delete/new） |
| `/help` | 显示帮助 |

`--repl` 参数保留，与不带参数效果相同。带查询参数运行时（如 `codelab-sage "帮我写代码"`）则为单次任务模式，执行完即退出。

全屏 UI 中输入 `/` 会弹出分类命令菜单，支持上下箭头选择、Tab 补全、ESC 关闭。

**Ctrl+C 行为**：
- Sage 正在思考（调用 LLM 或流式输出）时，按一次 Ctrl+C 会发送 `AbortSignal` 中断当前请求，UI 回到可输入状态。
- 空闲时，1.5 秒内连续按两次 Ctrl+C 才会退出程序；按一次仅提示“再按一次退出”。
- Escape 键仍保持立即退出（全屏 UI 中）。

### 4.6 多模型提供方设计

#### 4.6.1 配置结构

配置文件中的 `providers` 数组支持配置多个模型提供方：

```json
{
  "providers": [
    {
      "id": "my-gpt4",
      "provider": "openai",
      "apiKey": "sk-...",
      "model": "gpt-4o"
    },
    {
      "id": "local",
      "provider": "ollama",
      "apiKey": "ollama",
      "baseURL": "http://localhost:11434/v1",
      "model": "llama3"
    },
    {
      "id": "claude",
      "provider": "anthropic",
      "apiKey": "sk-ant-...",
      "model": "claude-sonnet-4-20250514"
    }
  ],
  "activeProvider": "my-gpt4"
}
```

#### 4.6.2 支持的 provider 类型

| Provider | 实现 | 说明 |
| :--- | :--- | :--- |
| `openai` | `OpenAIProvider` | OpenAI 及兼容 API |
| `anthropic` | `AnthropicProvider` | Anthropic Messages API，内部做消息格式翻译（system 提取、tool 转 tool_result/content block） |
| `ollama` | `OpenAIProvider`（复用） | 本地 Ollama，使用其 OpenAI 兼容端点 |
| 自定义 + baseURL | `OpenAIProvider`（复用） | 任意 OpenAI 兼容 API（如 DeepSeek、Groq 等） |

#### 4.6.3 运行时切换

- `/model <name>` 调用 `Agent.switchProvider(entry, newProvider)`，其中 `<name>` 是 `/login` 时设置的别名。
- 切换前检查是否有 pending tool call：若有则拒绝切换，提示用户等待当前回答完成
- 切换后消息历史保留不删，由各 Provider 内部自行翻译消息格式
- 配置自动持久化到 `~/.codelab-sage/config.json`

#### 4.6.4 向后兼容

如果配置文件中只有旧的 `apiKey` + `model` 字段（没有 `providers` 数组），系统自动创建一个 `id: "default"` 的 ProviderEntry，保证老用户零改动升级。

#### 4.6.5 上下文窗口与压缩

- 配置项 `contextLimit` 指定上下文上限（token 数），默认 `128000`。
- 当前上下文使用量以 `context: 38.4% (100.6k/262.1k)` 形式显示在状态栏右下角。
- 估算方式：未引入 tokenizer，使用字符数 `/ 4` 粗略估算 token（兼容 CJK 与 Latin 文本）。
- 每次 AI 回复完成后，若使用量 `>= 100%`，自动调用 `Agent.compact()`：
  - 保留 system prompt；
  - 丢弃最旧的用户-助手 exchange；
  - 始终保留最新一次 exchange；
  - 直到剩余上下文低于 `contextLimit` 的 50%。
- 用户可随时输入 `/compact` 手动触发压缩。

### 4.7 任务队列

- 新增 `TaskQueue` 类（`src/cli/task-queue.ts`），内存队列，支持 `normal` / `high` 优先级。
- 普通用户输入与 `/search` 进入队尾；`/plan`、`/explore` 插入队首（高优先级）。
- 当前任务执行期间，输入框保持可用，新输入自动入队。
- 状态栏显示队列状态：
  - 执行中：`正在处理: {preview} (1/{total})`
  - 等待中：`队列: N 个任务等待中`
  - 空闲：`等待输入`
- 队列命令：`/queue list`、`/queue clear`、`/queue cancel`。
- 程序退出时队列清空，不做持久化。

### 4.8 子 Agent 设计

#### 4.7.1 AgentDefinition

子 Agent 通过 `AgentDefinition` 定义：

```typescript
interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  toolNames?: string[];
  skillTags?: string[];
  inheritParentMessages?: number;
}
```

#### 4.7.2 AgentFactory

`AgentFactory.createAgent(name)`：
1. 查找 `AgentDefinition`。
2. 根据 `toolNames` 过滤 `ToolRegistry`。
3. 根据 `skillTags` 过滤 Skill。
4. 使用 `systemPromptOverride` 创建新的 `Agent` 实例。

#### 4.7.3 上下文继承

子 Agent 通过 `runWithContext(task, parentMessages)` 运行，默认继承最近 5 条父对话消息。

### 4.9 会话持久化设计

#### 4.8.1 Session 结构

```typescript
interface Session {
  id: string;
  title: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  activeProvider?: string;
  activeRole?: string;
  activeAgent?: string;
}
```

#### 4.8.2 存储位置

`~/.codelab-sage/sessions/{id}.json`

#### 4.8.3 恢复粒度

加载会话时恢复完整对话历史。当前 provider、role、agent 由 UI 在加载后根据 `config` 处理。

### 4.10 权限与 YOLO 设计

#### 4.9.1 确认策略

`PermissionManager.shouldConfirm(context)` 按以下顺序判断：
1. YOLO 模式开启 → 不确认。
2. 工具配置 `requireConfirm: false` → 不确认。
3. 工具配置 `requireConfirm: true` → 仅当操作是破坏性时确认。
4. 非破坏性操作 → 不确认。
5. 破坏性操作且目标路径在当前工作目录外 → 确认。
6. 破坏性操作 → 确认。

#### 4.9.2 YOLO 模式

- CLI：`--yolo`
- REPL：`/yolo`、`/yolo on`、`/yolo off`
- 配置：`yolo: true/false`

### 4.11 MCP 支持设计

#### 4.11.1 配置

```json
{
  "mcpServers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "env": { "KEY": "value" }
    }
  ]
}
```

#### 4.10.2 工具注册

MCP 工具注册为 `{serverName}_{toolName}`，避免不同服务器同名冲突。

#### 4.10.3 生命周期

`McpClient` 通过 stdio 与服务器通信：
1. 发送 `initialize`。
2. 发送 `tools/list` 获取工具列表。
3. 调用 `tools/call` 执行工具。
4. 进程退出时发送 `SIGTERM` 断开连接。

---

## 第五章：数据流设计

### 5.1 System Prompt 的构建方式

System Prompt 在每次发送给 LLM 前动态构建，流程如下：

1. **加载基础模板**：System Prompt 基础身份与行为约束以字符串常量形式内嵌在 `src/agent/prompt.ts` 中，避免运行时依赖外部文件。
2. **注入 Skill**：Skill Loader 扫描所有 Skill 文件，过滤激活的 Skill，按优先级排序，将每个 Skill 的正文拼接为 `## Skill: <name>\n<content>` 形式。
3. **注入工具描述**：从 Tool Registry 获取所有注册工具的 JSON Schema，以 LLM 要求的格式追加到 System Prompt。
4. **缓存与更新**：Skill 内容可缓存其哈希值，当文件变更时重新构建，避免每次请求都读取磁盘。

```
基础模板 ──► Skill 拼接 ──► 工具描述 ──► 最终 System Prompt
```

### 5.2 用户消息与模型交互的数据流

```
用户输入
   │
   ▼
[用户消息] ──► 消息队列
   │
   ▼
System Prompt + 历史消息 + 当前用户消息
   │
   ▼
LLM Provider.chat({ messages, tools })
   │
   ▼
LLM 返回：{ role: 'assistant', content?: string, tool_calls?: [...] }
   │
   ▼
解析响应，决定输出或工具调用
```

消息队列采用数组实现，元素类型符合 OpenAI Chat Completions 消息格式。对长对话，可考虑在接近上下文长度限制时进行摘要或截断。

### 5.3 工具调用和结果返回的数据流

1. LLM 返回 `tool_calls` 数组，每个元素包含 `id`、`function.name`、`function.arguments`。
2. Agent 解析参数，通过 `ToolRegistry.get(name)` 找到对应工具。
3. 使用 `zod` 校验参数。
4. 执行前进行安全校验与确认提示。
5. `ToolExecutor` 调用工具函数，捕获标准输出、标准错误、返回值或异常。
6. 将结果封装为 `tool` 消息：

```json
{
  "role": "tool",
  "tool_call_id": "call_xxx",
  "content": "工具执行结果字符串"
}
```

7. 追加到消息队列，再次调用 LLM。

### 5.4 对话历史的存储方式

- **会话内**：使用内存数组保存，REPL 模式全程保留，单条命令模式在任务完成后释放。
- **持久化（Session 系统）**：通过 `/session save` 将当前会话完整保存到 `~/.codelab-sage/sessions/{id}.json`，支持后续 `/session load` 恢复。Session 包含完整的消息数组、时间戳、标题等元数据。
- **隐私控制**：持久化前过滤掉可能包含 API Key、密码的消息内容。

---

## 第六章：配置与安全

### 6.1 API Key 的管理方式

API Key 是高度敏感信息，支持以下三种管理方式，按优先级从高到低：

1. **命令行参数**：`--api-key <key>`。仅建议调试或 CI 中使用，避免出现在 shell history。
2. **环境变量**：`OPENAI_API_KEY`（或 `CODELAB_SAGE_API_KEY`）。开发阶段推荐，配合 `.env` 文件使用。
3. **npm config**：`npm config set codelab-sage:apiKey <key>`。适合长期使用 npm 配置的用户。
4. **配置文件**：存储在 `~/.codelab-sage/config.json` 中，字段 `apiKey`。文件权限应设为 `0o600`。

读取优先级：`--api-key` > 环境变量 > npm config > 配置文件。

### 6.2 配置文件的结构和存储位置

配置文件位置：

- 用户级默认：`~/.codelab-sage/config.json`
- 项目级可选：`./.codelab-sage.json`
- 命令行指定：`--config <path>`

配置文件 JSON Schema 示例：

```json
{
  "$schema": "https://codelab-sage.dev/schema/config.json",
  "provider": "openai",
  "apiKey": "${OPENAI_API_KEY}",
  "model": "gpt-4o",
  "baseURL": "https://api.openai.com/v1",
  "skillDirs": [
    "~/.codelab-sage/skills",
    "./skills"
  ],
  "logLevel": "info",
  "confirmDestructive": true,
  "yolo": false,
  "activeAgent": "coder",
  "activeRole": "architect",
  "history": {
    "enabled": true,
    "maxDays": 30
  },
  "tools": {
    "bash": {
      "allowedCommands": ["git", "npm", "node", "pnpm"],
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

使用 `zod` 对配置文件进行运行时校验，遇到非法字段时给出清晰错误提示。

### 6.3 敏感信息保护措施

- **绝不日志打印 API Key**：日志中敏感字段统一替换为 `***`。
- **路径白名单**：`read_file` 默认禁止读取 `.env`、SSH 私钥、npmrc 等文件。
- **命令黑名单**：`bash` 工具内置危险命令黑名单，如 `rm -rf /`、`mkfs`、`dd` 等。
- **覆盖确认**：`write_file` 覆盖已有文件、`bash` 执行命令时默认要求确认。
- **工作目录外保护**：破坏性操作若目标路径超出当前工作目录，强制要求确认（YOLO 模式除外）。
- **YOLO 模式**：用户可通过 `--yolo` 或 `/yolo on` 显式跳过确认，状态栏会显示 `YOLO` 提醒。
- **环境隔离**：建议在容器或受限用户下运行；不推荐在生产服务器上以 root 身份运行。
- **Token 消耗提示**：在 `--verbose` 模式下输出每次请求的 token 消耗，帮助用户控制成本。

### 6.4 错误处理和容错机制

| 错误类型 | 处理策略 |
| :--- | :--- |
| 网络超时 | 默认重试 3 次，指数退避；超过后提示用户检查网络或 API Key |
| API Key 无效 | 捕获 401 错误，提示用户配置正确的 Key，不泄露原始错误堆栈 |
| 工具执行失败 | 将错误信息作为 tool 消息返回给 LLM，让模型自行修正策略 |
| 参数校验失败 | 使用 `zod` 给出字段级错误，模型可在下一轮修正 |
| 上下文超限 | 检测 token 总数，接近上限时进行摘要或丢弃早期非关键消息 |
| 文件不存在 | 返回结构化错误，避免整个 Agent 崩溃 |
| LLM 返回格式异常 | 记录日志，向用户展示友好提示 |

所有错误均通过统一的 `CodelabSageError` 基类封装，包含错误码、用户可读消息、可选的内部详情。

---

## 第七章：开发计划

### 7.1 阶段一：项目骨架与工具链（第 1 周）✅ 已完成

- 初始化 TypeScript + Node 项目。
- 配置 ESLint、Prettier、Vitest、tsconfig。
- 实现 CLI 入口与参数解析。
- 输出：可运行的 `codelab-sage --version`。

### 7.2 阶段二：大模型接入层（第 1-2 周）✅ 已完成

- 抽象 `LLMProvider` 接口。
- 实现 OpenAI Provider，支持聊天与 Tool Calling。
- 接入配置模块，支持 API Key、模型选择。
- 输出：可通过 CLI 与 OpenAI 模型进行简单对话。

### 7.3 阶段三：工具系统（第 2-3 周）✅ 已完成

- 实现 Tool Registry、Tool Executor。
- 完成 `read_file`、`write_file`、`bash`、`weather` 四个内置工具。
- 实现参数校验、安全确认、结果格式化。
- 输出：Agent 可调用工具完成文件读写、命令执行、天气查询。

### 7.4 阶段四：Agent 核心循环（第 3 周）✅ 已完成

- 实现 ReAct 循环。
- 维护对话历史。
- 处理工具调用与结果回送。
- 输出：支持多轮工具调用并给出最终答案。

### 7.5 阶段五：Skill 加载系统（第 3-4 周）✅ 已完成

- 定义 Skill 文件格式与 Schema。
- 实现本地目录扫描、排序、拼接。
- 将 Skill 内容注入 System Prompt。
- 输出：加载 Codelab 规范 Skill 后，模型回答体现组织风格。

### 7.6 阶段六：交互式 REPL 与用户体验（第 4 周）✅ 已完成

- 实现 REPL 模式与内置命令。
- 添加颜色、加载动画、错误提示风格。
- 完善帮助信息。
- 输出：具备良好终端体验的交互式 Agent。

### 7.7 阶段七：测试、文档与 CI（第 5 周）✅ 已完成

- 编写单元测试与集成测试。
- 完善 README、Skill 编写指南、贡献指南。
- 配置 GitHub Actions CI（Linux + Windows，Node 18/20/22 矩阵）。
- 修复跨平台 bash 工具兼容（Windows cmd / Unix bash 自动检测）。

### 7.8 阶段八：多模型提供方支持（v0.2.0）✅ 已完成

- 新增 `ProviderEntry` 配置 schema，支持多 provider 列表。
- 实现 `AnthropicProvider`（Anthropic Messages API，含消息格式翻译层）。
- 支持 Ollama 本地模型（复用 OpenAIProvider + 自动 baseURL）。
- REPL 新增 `/login`、`/models`、`/model <name>` 命令。
- `Agent.switchProvider()` 支持运行时切换，含 pending tool_call 门禁。

### 7.9 阶段九：子 Agent 与搜索工具（v0.3.0）✅ 已完成

- 定义 `AgentDefinition` / `AgentContext` / `AgentRegistry`。
- 实现 `AgentFactory`，支持按工具名与 Skill tags 过滤。
- 内置 `coder`、`explore`、`plan` 三个子 Agent。
- `Agent.runWithContext()` 支持继承父对话上下文。
- 实现 `search_code` 与 `search_files` 工具（ripgrep + Node.js 降级）。
- UI 新增 `/agents`、`/agent`、`/plan`、`/explore`、`/search` 命令。

### 7.10 阶段十：会话持久化（v0.4.0）✅ 已完成

- 实现 `SessionStore`（JSON 文件存储在 `~/.codelab-sage/sessions/`）。
- 实现 `SessionManager`（create/save/load/fork/delete/list）。
- `Agent` 支持 `exportMessages()` / `importMessages()`。
- UI 新增 `/session` 命令族。

### 7.11 阶段十一：权限与 YOLO 模式（v0.5.0）✅ 已完成

- 实现 `PermissionManager`，支持全局 YOLO、按工具配置、工作目录外保护。
- CLI 新增 `--yolo`，配置新增 `yolo` 字段。
- UI 新增 `/yolo` 命令，状态栏显示 YOLO 状态。
- `bash` 与 `write_file` 工具接入权限管理。

### 7.12 阶段十二：MCP 支持（v0.6.0）✅ 已完成

- 配置新增 `mcpServers`。
- 实现 `McpClient`（stdio JSON-RPC）。
- 实现 `createMcpTools` 适配器，工具名前缀 `{serverName}_`。
- `loadMcpServers()` 在启动时自动连接并注册 MCP 工具。

---

## 第八章：目录结构

```
codelab-sage/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI（Linux + Windows，Node 18/20/22）
├── bin/
│   └── sage.js                 # npm 可执行入口，调用 dist/cli/index.js
├── docs/
│   ├── technical-design.md     # 本文档
│   ├── skill-authoring.md      # Skill 编写指南
│   └── contributing.md         # 贡献者指南
├── skills/
│   ├── codelab-core.md         # 内置 Codelab 核心 Skill 示例
│   ├── prompt-engineering.md   # 提示词工程 Skill
│   ├── tool-safety.md          # 工具安全 Skill
│   └── typescript-cli.md       # TypeScript CLI Skill
├── src/
│   ├── agent/
│   │   ├── agent.ts            # Agent 类与 ReAct 循环
│   │   ├── agent-factory.ts    # 子 Agent 工厂
│   │   ├── types.ts            # Agent 定义类型
│   │   └── prompt.ts           # System Prompt 构建
│   ├── agents/
│   │   └── builtins/           # 内置子 Agent（coder/explore/plan）
│   ├── cli/
│   │   ├── index.ts            # CLI 入口与参数解析
│   │   ├── fullscreen-ui.ts    # 全屏 blessed UI
│   │   ├── chat-ui.ts          # 简单行模式聊天界面
│   │   ├── login-wizard.ts     # 交互式 provider 添加向导
│   │   └── repl.ts             # 交互式 REPL 实现（备用）
│   ├── config/
│   │   ├── config.ts           # 配置加载与合并
│   │   ├── schema.ts           # zod 配置 schema
│   │   └── defaults.ts         # 默认配置
│   ├── llm/
│   │   ├── provider.ts         # LLMProvider 抽象类型
│   │   ├── openai-provider.ts  # OpenAI 实现
│   │   ├── anthropic-provider.ts # Anthropic Claude 实现
│   │   └── factory.ts          # Provider 工厂
│   ├── skills/
│   │   ├── loader.ts           # Skill 扫描与加载
│   │   ├── skill.ts            # Skill 数据结构与 zod schema
│   │   └── renderer.ts         # Skill 拼接为 Prompt
│   ├── tools/
│   │   ├── builtins.ts         # 内置工具集合与注册入口
│   │   ├── registry.ts         # 工具注册表
│   │   ├── executor.ts         # 工具执行器
│   │   ├── tool.ts             # Tool 接口定义
│   │   └── definitions/
│   │       ├── bash.ts         # bash 工具
│   │       ├── readFile.ts
│   │       ├── writeFile.ts
│   │       ├── weather.ts
│   │       ├── searchCode.ts
│   │       └── searchFiles.ts
│   ├── session/
│   │   ├── manager.ts          # 会话管理
│   │   ├── store.ts            # 会话文件存储
│   │   └── types.ts            # 会话类型
│   ├── permissions/
│   │   └── manager.ts          # 权限与 YOLO 管理
│   ├── mcp/
│   │   ├── client.ts           # MCP stdio 客户端
│   │   ├── adapter.ts          # MCP 工具适配
│   │   ├── loader.ts           # MCP 服务器加载
│   │   └── types.ts            # MCP 类型
│   ├── types/
│   │   └── index.ts            # 全局类型定义
│   ├── utils/
│   │   ├── errors.ts           # 错误基类 CodelabSageError
│   │   ├── logger.ts           # 日志工具
│   │   ├── search.ts           # 搜索工具实现
│   │   └── git.ts              # Git 状态读取
│   └── index.ts                # 库入口（供程序化调用）
├── tests/
│   ├── unit/                   # 单元测试
│   │   ├── agent.test.ts
│   │   ├── agent-factory.test.ts
│   │   ├── config.test.ts
│   │   ├── skills.test.ts
│   │   ├── tools.test.ts
│   │   ├── search.test.ts
│   │   ├── session/
│   │   │   ├── store.test.ts
│   │   │   └── manager.test.ts
│   │   ├── permissions.test.ts
│   │   └── mcp.test.ts
│   ├── integration/            # 集成测试
│   │   ├── agent-loop.test.ts
│   │   └── config-skills.test.ts
│   └── fixtures/               # 测试数据
├── .env.example                # 环境变量示例
├── .eslintrc.cjs
├── .prettierrc
├── LICENSE
├── package.json
├── README.md
├── tsconfig.json
└── vitest.config.ts
```

### 8.1 关键目录说明

- `bin/`：npm 包发布后的可执行脚本入口。
- `docs/`：面向开发者与用户的文档。
- `skills/`：项目内置的 Skill 模板，安装后也会复制到用户目录。
- `src/agent/`：核心推理循环与子 Agent 工厂。
- `src/agents/`：内置子 Agent 定义。
- `src/cli/`：命令行交互层。
- `src/llm/`：大模型接入抽象。
- `src/tools/`：工具定义与执行。
- `src/skills/`：Skill 加载与渲染。
- `src/session/`：会话持久化。
- `src/permissions/`：权限与 YOLO 管理。
- `src/mcp/`：MCP 客户端与适配器。
- `tests/`：测试用例，尽量覆盖核心路径与错误分支。

---

## 第九章：用户体验设计

### 9.1 终端输出样式设计

使用 `chalk` 定义统一的主题色：

| 语义 | 颜色 | 用途 |
| :--- | :--- | :--- |
| 主品牌色 | 青色 `cyan` | Agent 名称、提示符、关键标题 |
| 成功 | 绿色 `green` | 工具执行成功、完成提示 |
| 警告 | 黄色 `yellow` | 需要确认、潜在风险 |
| 错误 | 红色 `red` | 错误信息 |
| 信息 | 灰色 `gray` | 时间戳、token 消耗、调试信息 |
| 高亮 | 白色加粗 `white.bold` | 重要字段、文件名、命令 |

### 9.2 加载动画

- LLM 推理、文件读写、网络请求等耗时操作使用 `ora` 显示旋转动画。
- 动画文案清晰，例如：
  - `🧙 Sage 正在思考...`
  - `📖 正在读取 package.json...`
  - `🌤  正在查询天气...`
- 工具执行完成或失败后，动画停止并显示 `✔` 或 `✖`。

### 9.3 错误提示风格

错误提示遵循“先说结论，再给建议”的原则：

```
✖ 无法连接到 OpenAI API
  原因：请求超时（已重试 3 次）
  建议：
    1. 检查网络连接
    2. 确认 OPENAI_API_KEY 是否正确
    3. 尝试使用 --model 指定其他模型
```

### 9.4 帮助信息的格式

帮助信息使用清晰的层级结构，示例：

```
Usage: codelab-sage [options] [query]

A terminal agent distilled from the wisdom of Codelab.

Options:
  -m, --model <model>      选择使用的模型 (default: gpt-4o)
  -s, --skill-dir <dir>    添加自定义 Skill 目录
  -c, --config <path>      指定配置文件
  -r, --repl               进入交互式对话模式
  -v, --verbose            显示详细日志
  --no-confirm             禁用危险操作确认
  -k, --api-key <key>      通过命令行传入 API Key
  -V, --version            显示版本号
  -h, --help               显示帮助信息

Examples:
  $ codelab-sage "解释这段代码"
  $ codelab-sage --repl
  $ codelab-sage "重构这个函数" -s ./my-skills
```

---

## 第十章：未来扩展

### 10.1 后续可迭代的功能方向

- **更多 LLM 提供方**：Google Gemini、本地模型（Ollama 以上已支持）等。
- **长记忆能力**：基于向量的长期记忆，允许 Agent 记住用户偏好与项目上下文。
- **代码审查工作流**：直接对 `git diff` 进行审查，输出符合 Codelab 规范的 Review 意见。
- **CI/CD 集成**：作为 GitHub Action 运行，自动对 PR 进行评论、检查与建议。
- **Web UI**：在终端之外提供可选的浏览器界面，展示对话历史与工具执行详情。
- **MCP SSE 传输**：除 stdio 外支持 SSE 远程 MCP 服务器。

### 10.2 扩展性设计考虑

- **插件化工具**：工具注册表基于接口实现，新增工具只需实现 `ToolDefinition` 并注册。
- **Skill 市场**：Skill 可以发布为独立 npm 包，用户通过 `codelab-sage skill install <pkg>` 安装。
- **Provider 抽象**：`LLMProvider` 接口屏蔽不同模型差异，未来接入新模型无需改动核心循环。
- **Hook 机制**：在消息发送前后、工具执行前后提供 Hook，方便插件拦截与增强。
- **配置扩展**：配置文件支持插件字段，允许第三方插件读取自己的配置。
- **MCP 生态**：已兼容 Model Context Protocol stdio 模式，可接入更广泛的工具生态。

---

## 附录：术语表

| 术语 | 说明 |
| :--- | :--- |
| ReAct | Reasoning + Acting，一种让大模型通过思考与工具调用解决任务的范式 |
| Skill | 经过蒸馏的 Codelab 经验文件，注入 System Prompt |
| System Prompt | 发送给大模型的系统级提示，定义 Agent 身份、能力与约束 |
| Tool Calling | 大模型输出结构化工具调用请求，由外部系统执行 |
| Provider | 大模型服务提供方，如 OpenAI、Anthropic |
| REPL | Read-Eval-Print Loop，交互式对话模式 |

---

## 附录：参考资料

- OpenAI Function Calling 文档：https://platform.openai.com/docs/guides/function-calling
- Commander.js 文档：https://github.com/tj/commander.js
- Zod 文档：https://zod.dev
- Open-Meteo API：https://open-meteo.com
