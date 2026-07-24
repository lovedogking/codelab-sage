# codelab-sage 技术栈临时文档

> 生成时间：2026-07-24
> 用途：临时参考，可按需调整或归档到 `docs/`。

---

## 1. 运行时与语言

| 技术 | 版本/说明 | 用途 |
|------|-----------|------|
| **Node.js** | >= 18.0.0 | 运行时 |
| **TypeScript** | 5.6.2 | 主语言，`ES2022` + `NodeNext` 模块 |
| **pnpm** | v9（CI 固定） | 包管理器 |

---

## 2. 终端 UI 层

| 技术 | 用途 |
|------|------|
| **blessed** | 全屏 TUI（Raw Mode）底层：屏幕接管、Box 布局、Textbox 输入框、光标、键盘中断、滚动区域、状态栏 |
| **@inquirer/prompts** | 简单行模式 REPL 的输入循环（`input`、`select`），替代原生 readline，避免 Windows PowerShell 光标问题 |
| **chalk** | 终端颜色与样式（状态栏、消息前缀、提示文字） |
| **boxen** | 带圆角边框的欢迎界面（ASCII Art Sage） |
| **ora** | 加载 spinner（Thinking / Responding） |

### 2.1 光标与输入

- **全屏模式**：`blessed.textbox` + `inputOnFocus: false`（由 screen 级 `keypress` 事件手动转发到 textbox，绕过 blessed 的焦点分发）+ 人工光标 (`artificial: true`)，由 `ensureInputFocus()` 统一聚焦并 `screen.render()`。
- **简单模式**：`@inquirer/prompts` 的 `input()`，依赖其内部 readline 管理光标。
- **命令菜单**：`blessed.box` 浮层，通过监听 `inputBox` 的 `keypress` 事件实时过滤 `/` 命令。

---

## 3. CLI 与参数解析

| 技术 | 用途 |
|------|------|
| **commander** | CLI 参数解析、子命令、help/version 生成 |
| **dotenv** | 自动加载 `.env` 文件到环境变量 |
| **fs-extra** | 跨平台文件操作（复制 skills、读写配置等） |

---

## 4. LLM / AI 层

| 技术 | 用途 |
|------|------|
| **openai** | OpenAI 官方 SDK，复用其 OpenAI-compatible 端点支持 DeepSeek / Ollama / 自定义 baseURL |
| **原生 fetch** | Anthropic Claude Messages API 调用 |
| **AbortSignal** | 标准 Web API，用于 `Ctrl+C` 中断 LLM 请求 |

### 4.1 支持的 Provider

- `openai`：OpenAI 及任意兼容 API
- `deepseek`：DeepSeek API（通过 OpenAI 兼容端点，默认模型 `deepseek-chat`）
- `anthropic`：Anthropic Messages API
- `ollama`：本地 Ollama（OpenAI 兼容端点）
- 自定义 baseURL：走 `OpenAIProvider`

---

## 5. Agent 架构

| 概念/模式 | 说明 |
|-----------|------|
| **ReAct 循环** | `Agent.runLoop()`：思考 → 工具调用 → 观察 → 再思考，最多 10 轮 |
| **子 Agent** | `AgentFactory` 创建 `coder` / `explore` / `plan`，按 `toolNames` 与 `skillTags` 过滤 |
| **上下文继承** | 子 Agent 通过 `runWithContext()` 继承父对话最近 5 条消息 |
| **上下文压缩** | `Agent.compact()`：超过 `contextLimit` 时丢弃最旧 exchange，保留 system prompt 与最新对话 |
| **Token 估算** | 未引入 tokenizer，使用 `字符数 / 4` 粗略估算 |

---

## 6. 工具系统

| 技术 | 用途 |
|------|------|
| **内置工具** | `read_file`、`write_file`、`bash`、`weather`、`search_code`、`search_files` |
| **ripgrep (rg)** | 代码搜索优先实现；不可用时降级为 Node.js 遍历 |
| **child_process** | `bash` 工具执行 shell；`McpClient` stdio 通信 |
| **Zod** | 工具参数 schema 定义与校验 |

---

## 7. Skill 系统

| 技术 | 用途 |
|------|------|
| **YAML** | 解析 Skill Markdown 文件的 frontmatter 元数据 |
| **Markdown + frontmatter** | Skill 文件格式，正文注入 System Prompt |
| **按 role / tags 过滤** | `filterSkillsByRole()` 实现角色化提示词 |

---

## 8. 配置管理

| 技术 | 用途 |
|------|------|
| **Zod** | `src/config/schema.ts` 定义并校验 `SageConfig` |
| **分层合并** | 默认值 < 配置文件 `~/.codelab-sage/config.json` < 环境变量 < CLI 参数 |
| **环境变量** | `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`CODELAB_SAGE_MODEL`、`CODELAB_SAGE_LOG_LEVEL`、`CODELAB_SAGE_SKILL_DIRS` 等 |

---

## 9. 会话持久化

| 技术 | 用途 |
|------|------|
| **JSON 文件** | `~/.codelab-sage/sessions/{id}.json` 保存完整对话、provider、role、agent、CWD |
| **SessionManager** | create / save / load / fork / delete / list |

---

## 10. MCP 支持

| 技术 | 用途 |
|------|------|
| **stdio + JSON-RPC** | `McpClient` 通过 `child_process.spawn` 启动外部 MCP 服务器 |
| **tools/list & tools/call** | 发现与调用 MCP 工具 |
| **适配器** | MCP 工具注册为 `{serverName}_{toolName}`，避免命名冲突 |

---

## 11. 权限与安全

| 技术 | 用途 |
|------|------|
| **PermissionManager** | 全局 YOLO、按工具 `requireConfirm`、工作目录外额外保护 |
| **命令黑名单** | `bash` 工具内置 `rm -rf /`、`mkfs`、`dd` 等危险命令拦截 |
| **路径白名单** | `read_file` 禁止读取 `.env`、SSH 私钥等敏感文件 |

---

## 12. 开发工具链

| 技术 | 用途 |
|------|------|
| **TypeScript Compiler (`tsc`)** | 构建到 `dist/`，输出 `.js` + `.d.ts` + sourcemap |
| **ESLint** | 代码检查，使用 `@typescript-eslint/recommended` + type-aware rules |
| **Prettier** | 代码格式化 |
| **Vitest** | 单元测试 + 集成测试 |
| **tsx** | 开发时直接运行 TypeScript（`pnpm dev`） |

---

## 13. CI/CD

| 技术 | 用途 |
|------|------|
| **GitHub Actions** | `.github/workflows/ci.yml` |
| **矩阵构建** | Ubuntu + Windows，Node 18 / 20 / 22（触发分支：`master`） |
| **流水线** | install → lint → format check → build → test |

---

## 14. 目录结构速览

```
src/
├── agent/           # Agent 核心循环、子 Agent 工厂
├── agents/          # 内置子 Agent 定义（coder/explore/plan）
├── cli/             # CLI 入口、全屏 UI、简单 UI、登录向导、任务队列
├── config/          # 配置 schema / 加载 / 默认值
├── llm/             # LLM Provider 抽象与实现
├── mcp/             # MCP 客户端与适配器
├── permissions/     # 权限与 YOLO 管理
├── session/         # 会话持久化
├── skills/          # Skill 加载与渲染
├── tools/           # 工具注册表、执行器、内置工具定义
├── types/           # 全局类型
└── utils/           # 日志、错误、搜索、Git、上下文估算
```

---

## 15. 关键交互实现速查

| 功能 | 实现位置 | 核心技术 |
|------|----------|----------|
| 全屏 Raw Mode | `src/cli/fullscreen-ui.ts` | `blessed` |
| 简单行模式 | `src/cli/chat-ui.ts` | `@inquirer/prompts` |
| `/` 命令菜单 | `src/cli/fullscreen-ui.ts` | `blessed.box` + 实时过滤 |
| 历史记录 | `src/cli/fullscreen-ui.ts` / `chat-ui.ts` | 内存数组 |
| 流式输出 | `src/cli/fullscreen-ui.ts` | 逐字 `delay(20)` |
| Ctrl+C 中断思考 | `fullscreen-ui.ts` / `chat-ui.ts` | `AbortSignal` |
| 双击 Ctrl+C 退出 | `fullscreen-ui.ts` / `chat-ui.ts` | 计数器 + 1.5s 超时 |
| 上下文百分比 | 状态栏 + `src/utils/context.ts` | 字符 `/ 4` 估算 |
| 自动压缩 | `Agent.compact()` | 丢弃旧 exchange |
| `/compact` | `fullscreen-ui.ts` / `chat-ui.ts` | 手动调用 `compact()` |

---

*文档结束。*
