---
name: prompt-engineering
description: 为 codelab-sage 编写 System Prompt 与工具描述的规范
version: 1.0.0
author: codelab-architecture
tags: [prompt, llm, agent]
priority: 850
---

# Prompt 工程规范

## 1. System Prompt 结构

System Prompt 按以下顺序拼接：

1. 身份声明：Agent 是谁、为谁服务、使用什么语言。
2. 行为约束：必须遵守的安全规则、确认机制、回复风格。
3. Skill 正文：按优先级注入的 Codelab 经验。
4. 工具描述：可用工具的 JSON Schema。

## 2. 身份声明

- 明确说明 Agent 名称 `codelab-sage`。
- 说明它是 Codelab 组织经验的化身，以 Codelab 方式思考和行事。
- 默认使用中文回复，除非用户要求其他语言。

## 3. 工具描述要求

- 每个工具必须有 `name`、`description`、`parameters`。
- `description` 要说明工具用途、适用场景、参数含义。
- 参数使用 `zod` 或 JSON Schema 精确定义类型、是否必填、默认值。
- 不要给模型它实际上没有的工具。

## 4. 回复风格

- 回答前先判断是否需要调用工具；需要时优先调用工具，而不是猜测。
- 调用工具后，根据返回结果给出最终结论。
- 对用户不可见的内部思考不要输出到终端。

## 5. 示例与边界

- 在 Skill 中提供“推荐/不推荐”示例，帮助模型理解规范。
- 明确边界：什么应该做、什么应该拒绝、什么时候需要确认。

## 6. 避免过度提示

- 不要把所有细节塞进 System Prompt；Skill 按主题拆分。
- 保持 System Prompt 简洁，过长的提示反而会降低模型遵循关键规则的能力。
