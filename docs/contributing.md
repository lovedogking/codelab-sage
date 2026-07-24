# 贡献指南

感谢你对 `codelab-sage` 的关注！无论是报告 bug、提出功能建议、改进文档还是提交代码，都欢迎你的参与。

## 行为准则

请尊重所有参与者。保持友好、包容的交流氛围。

## 如何贡献

### 报告 Bug

在提交 Issue 前，请搜索已有 Issue 确认是否有人报告过相同问题。

提交时请包含以下信息：

- **环境信息**：Node.js 版本（`node -v`）、操作系统、codelab-sage 版本（`codelab-sage --version`）
- **复现步骤**：精确的命令行输入与观察到的输出
- **期望行为**：你认为正确的行为应该是什么
- **日志**：如果可用，附上 `--verbose` 模式下的日志（注意移除敏感信息）

### 功能建议

在 Issue 中描述：

- 你的使用场景
- 期望的功能行为
- 为什么现有功能不能满足需求

### 提交代码

#### 开发环境搭建

```bash
# 克隆仓库
git clone <repo-url>
cd codelab-sage

# 安装依赖（推荐 pnpm）
pnpm install

# 验证环境
pnpm test
pnpm build
```

#### 项目结构

```
codelab-sage/
├── src/
│   ├── agent/        # Agent 核心循环、子 Agent 工厂、类型定义
│   ├── agents/       # 内置子 Agent 定义（coder/explore/plan）
│   ├── cli/          # CLI 入口、ChatTUI、FullscreenUI、登录向导、任务队列
│   ├── config/       # 配置加载、合并与校验
│   ├── llm/          # 大模型接入层（Provider 抽象、OpenAI/Anthropic 实现）
│   ├── skills/       # Skill 加载与渲染
│   ├── tools/        # 工具注册、执行与内置工具定义
│   ├── session/      # 会话持久化（Manager / Store / Types）
│   ├── permissions/  # 权限与 YOLO 管理
│   ├── mcp/          # MCP 客户端与适配器
│   ├── types/        # 全局类型定义
│   └── utils/        # 工具函数（错误、日志、Git、上下文估算、搜索）
├── tests/
│   ├── unit/         # 单元测试（agent、config、skills、tools、mcp、session 等）
│   └── integration/  # 集成测试（agent-loop、config-skills）
├── skills/           # 内置 Skill 模板
└── docs/             # 文档
```

#### 开发流程

1. **Fork 仓库**并在新分支上开发
2. **编写代码**并确保类型正确：

   ```bash
   pnpm build        # 类型检查 + 编译
   pnpm lint         # 代码检查
   pnpm format       # 代码格式化
   ```

3. **编写测试**覆盖你的改动：

   ```bash
   pnpm test         # 运行全部测试
   pnpm test:watch   # 监听模式
   ```

4. **提交 Pull Request**，在描述中说明改了什么、为什么这样改

#### 代码风格

- 使用 TypeScript，所有公开 API 要有类型注解
- 使用 `const` 优先，需要重新赋值时用 `let`，不用 `var`
- 异步函数使用 `async/await`，不使用回调
- 错误使用 `CodelabSageError` 基类（`src/utils/errors.ts`），附上有意义的错误码
- 文件命名：模块文件用 camelCase（如 `openai-provider.ts`），目录用小写

### 添加新工具

1. 在 `src/tools/definitions/` 下新建文件，实现 `Tool` 接口：

   ```typescript
   import type { Tool } from '../tool.js';
   import type { SageConfig } from '../../config/schema.js';
   import { PermissionManager } from '../../permissions/manager.js';
   
   export function createMyTool(config: SageConfig, permissionManager?: PermissionManager): Tool {
     return {
       name: 'my_tool',
       description: '描述你的工具做什么',
       parameters: {
         type: 'object',
         properties: {
           arg1: { type: 'string', description: '参数说明' },
         },
         required: ['arg1'],
       },
       async execute(args) {
         // 实现你的工具逻辑
         return '执行结果';
       },
     };
   }
   ```

2. 在 `src/tools/builtins.ts` 中注册：

   ```typescript
   import { createMyTool } from './definitions/myTool.js';
   
   export function createBuiltinTools(config: SageConfig, permissionManager?: PermissionManager) {
     return [
       // ... existing tools ...
       createMyTool(config, permissionManager),
     ];
   }
   ```

3. 在 `tests/unit/tools.test.ts` 中添加测试

### 添加新的大模型 Provider

1. 在 `src/llm/` 下新建文件，实现 `LLMProvider` 接口（见 `src/types/index.ts`）
2. 在 `src/llm/factory.ts` 中注册你的 Provider
3. 更新 `src/config/schema.ts` 中的 `provider` 字段（如果需要）

### 添加内置子 Agent

1. 在 `src/agents/builtins/` 下新建文件，参考已有 Agent（`coder.ts`、`explore.ts`、`plan.ts`）：

   ```typescript
   import type { AgentDefinition } from '../../agent/types.js';

   export const myAgent: AgentDefinition = {
     name: 'my-agent',
     description: '简短描述 Agent 的用途',
     systemPrompt: '详细的 System Prompt…',
     toolNames: ['bash', 'read_file'],       // 可选，限制可用工具
     skillTags: ['code-review'],              // 可选，按标签筛选 Skill
     inheritParentMessages: 5,                // 可选，继承父 Agent 最近 N 条消息
   };
   ```

2. 在 `src/agents/builtins/index.ts` 中导出并注册。

3. 添加单元测试验证 AgentDefinition 结构和工厂创建逻辑。

### 文档贡献

文档文件位于 `docs/` 目录：

- `technical-design.md` — 技术设计文档
- `skill-authoring.md` — Skill 编写指南
- `contributing.md` — 本文件

文档使用中文编写。修改后请检查 Markdown 格式是否正确。

## 测试指南

### 运行测试

```bash
pnpm test              # 一次性运行全部
pnpm test:watch        # 监听文件变化自动重跑
```

### 测试结构

- `tests/unit/` — 函数/类级别的单元测试，使用 `vitest`
- `tests/integration/` — 跨模块的集成测试，使用 Fake Provider 模拟 LLM

### 添加测试

- 新增功能必须包含测试
- Bug 修复应包含回归测试
- 使用 Fake Provider（参考 `tests/integration/agent-loop.test.ts`）避免依赖真实的 LLM API

## 发布流程

由维护者执行：

1. 更新 `package.json` 中的版本号
2. 更新 `src/cli/index.ts` 中的版本号
3. 运行 `pnpm build && pnpm test`
4. 提交并打标签：`git tag v0.x.0`
5. 发布到 npm：`npm publish`

## 获取帮助

如有问题，请在 GitHub Issues 中提出。
