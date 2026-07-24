# Skill 编写指南

Skill 是 `codelab-sage` 的知识注入单元。每个 Skill 是一个 Markdown 文件，顶部包含 YAML frontmatter 元数据，正文是自由格式的知识内容。所有 Skill 会在每次对话开始时按优先级拼接进 System Prompt。

## 文件格式

```markdown
---
name: skill-name            # 必填，Skill 唯一标识
description: 简短描述        # 可选，会在加载日志中显示
version: 1.0.0              # 可选，语义化版本号
author: your-name           # 可选，作者署名
role: coder                 # 可选，绑定到指定角色，可通过 /role 切换
tags: [typescript, code-review]  # 可选，用于子 Agent 过滤与搜索
priority: 100               # 可选，加载优先级（越高越靠前），默认 0
---

# Skill 正文标题

正文内容，支持完整 Markdown 语法：
- 列表
- **加粗**
- `行内代码`
- 代码块
```

## 字段说明

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|:---|:---|:---|:---|:---|
| `name` | string | 是 | — | Skill 名称，建议使用 kebab-case |
| `description` | string | 否 | — | 简短描述，帮助用户了解 Skill 用途 |
| `version` | string | 否 | — | 语义化版本号，如 `1.0.0` |
| `author` | string | 否 | — | 作者名称或邮箱 |
| `role` | string | 否 | — | 角色标识，设置后该 Skill 仅在对应角色激活时注入。**注意：`/role` 切换角色会清空当前对话历史并重建 System Prompt。** |
| `tags` | string[] | 否 | — | 标签列表，子 Agent 可通过 `skillTags` 筛选 |
| `priority` | number | 否 | `0` | 加载优先级，越高越靠前排列在 System Prompt 中 |

## 编写建议

### 1. 保持简洁

Skill 正文会被拼接到 System Prompt 中，会消耗 token。每一条规则都要有明确的价值，避免冗长叙述。

```markdown
# 推荐：简洁指令
- 使用 `const` 声明不会重新赋值的变量。
- 异步函数统一返回 `Promise<T>` 类型。

# 不推荐：长篇大论
我们的团队经过长期实践……（500 字背景故事）
```

### 2. 使用具体示例

抽象规则容易让 LLM 产生歧义，给出正反示例效果更好。

```markdown
## 错误处理

- 不要吞掉异常。

```typescript
// ❌ 不推荐
try { await fetchData() } catch {}

// ✅ 推荐
try {
  await fetchData()
} catch (err) {
  logger.error('Failed to fetch data', err)
  throw err
}
```
```

### 3. 聚焦单一主题

一个 Skill 文件只讲一件事。不要把所有团队的规范塞进一个文件——分开后方便按需启用或禁用。

```
skills/
├── typescript-style.md      # TypeScript 代码风格
├── error-handling.md        # 错误处理规范
├── testing-guide.md         # 测试编写规范
└── git-commit.md            # Git 提交规范
```

### 4. 合理设置优先级

如果多个 Skill 对同一件事有不同规定，优先级高的会排在 System Prompt 更靠前的位置，通常更容易被 LLM 遵循。

| 场景 | 建议优先级 |
|:---|:---|
| 组织级强制规范 | 1000 |
| 项目级约定 | 500 |
| 个人偏好 | 100 |
| 参考资料 | 0 |

## 加载方式

Skill 会从以下位置加载（合并所有目录）：

1. `~/.codelab-sage/skills/` — 用户级 Skill
2. `./skills/` — 项目级 Skill
3. 通过 `--skill-dir <path>` 指定的自定义目录
4. 通过 `CODELAB_SAGE_SKILL_DIRS` 环境变量指定的目录（逗号分隔）

所有 `.md` 文件都会尝试解析，不符合格式的文件会被静默跳过。

## 与 System Prompt 的关系

Skill 最终会以以下结构注入 System Prompt：

```
你是 codelab-sage...

[基础行为约束]

# Injected Skills

## Skill: typescript-style
_Description: TypeScript 编码风格 | Version: 1.0.0 | Author: team_

... Skill 正文 ...

## Skill: error-handling
...

# Available Tools

- read_file: ...
- write_file: ...
- bash: ...
- weather: ...
- search_code: ...
- search_files: ...
```

高优先级的 Skill 排在前面。如果 Skill 总长度过大，建议精简或按场景分目录管理。

## Token 预算

- 默认上下文上限为 **128,000 token**（可通过 `contextLimit` 配置）。
- 所有 Skill 正文 + System Prompt + 对话历史共享该预算。
- 上下文使用率 `>= 100%` 时会**自动压缩**（丢弃最旧的 exchange，保留最新对话）。
- 可通过 `/compact` 手动触发压缩，状态栏实时显示用量百分比。
- **建议**：单个 Skill 控制在 500 token 以内，一个角色下所有 Skill 合计不超过 2000 token。
