---
name: typescript-cli
description: 使用 TypeScript 开发 Node.js CLI 工具的 Codelab 规范
version: 1.0.0
author: codelab-architecture
tags: [typescript, cli, nodejs]
priority: 900
---

# TypeScript CLI 开发规范

## 1. 类型优先

- 所有公开函数、配置对象、工具参数都必须有显式类型。
- 使用 `zod` 定义运行时的 schema，并从中推导 TypeScript 类型。
- 避免使用 `any`；如必须使用，需加 `eslint-disable` 并说明原因。

## 2. 异步代码

- 优先使用 `async/await`，而不是回调或裸 Promise 链。
- 文件系统操作使用 `fs/promises`，不要混用同步 API。

## 3. CLI 参数与交互

- 使用 `commander` 解析命令行参数。
- 危险操作必须通过 `inquirer` 请求二次确认，除非用户显式传入 `--no-confirm`。
- 帮助信息要包含用法、选项、示例三个部分。

## 4. 错误处理

- 所有错误都通过统一的错误基类抛出，包含错误码和人类可读信息。
- 不要向终端输出原始堆栈；`--verbose` 模式下可以输出调试详情。

## 5. 测试

- 使用 `vitest` 编写单元测试与集成测试。
- 对工具函数、配置解析、LLM Provider 抽象层必须覆盖核心路径。
- 测试数据放在 `tests/fixtures/`，不要污染真实文件系统。

## 6. 依赖管理

- 引入新依赖前，先确认现有依赖是否已经能解决问题。
- 优先选择体积小、类型定义完整、社区活跃的库。
