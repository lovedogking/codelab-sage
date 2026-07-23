# codelab-sage

**[English](README.md) | 中文**

一个凝聚了 Codelab 智慧的终端 CLI 智能体。

`codelab-sage` 运行在终端中，能够理解自然语言，并借助大语言模型和内置工具完成真实的工程任务：读取文件、写入文件、运行 shell 命令、查询天气等。

## 特性

- 💬 自然语言任务执行
- 🛠️ 内置工具：`read_file`、`write_file`、`bash`、`weather`
- 🧠 ReAct 推理循环：思考 → 行动 → 观察 → 回答
- 📚 Skill 系统：将 Codelab 知识与自定义规范注入系统提示词
- 🔁 交互式 REPL 模式，支持多轮对话
- ⚙️ 分层配置：默认值、配置文件、环境变量、CLI 选项
- 🔒 对破坏性操作进行安全确认

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
codelab-sage "Explain the contents of README.md"
```

启动交互式会话：

```bash
codelab-sage --repl
```

使用指定模型：

```bash
codelab-sage "Refactor this function" --model gpt-4o
```

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
  "confirmDestructive": true
}
```

### 环境变量

| 变量 | 说明 |
| :--- | :--- |
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `OPENAI_BASE_URL` | OpenAI 兼容提供商的自定义 base URL |
| `CODELAB_SAGE_MODEL` | 默认模型 |
| `CODELAB_SAGE_LOG_LEVEL` | 日志级别：`silent`、`error`、`warn`、`info`、`verbose`、`debug` |
| `CODELAB_SAGE_SKILL_DIRS` | Skill 目录列表，用逗号分隔 |

## Skills

Skills 是带有 YAML frontmatter 的 Markdown 文件，会被注入到系统提示词中。

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

将它们放在 `~/.codelab-sage/skills/` 或用 `--skill-dir` 指定的目录中。

## CLI 选项

```
Usage: codelab-sage [options] [query]

Options:
  -m, --model <model>      要使用的模型
  -s, --skill-dir <dir>    添加自定义 skill 目录
  -c, --config <path>      配置文件路径
  -r, --repl               进入交互式 REPL 模式
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

## 许可证

MIT
