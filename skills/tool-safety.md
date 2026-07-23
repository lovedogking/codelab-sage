---
name: tool-safety
description: codelab-sage 内置工具的安全设计与实现规范
version: 1.0.0
author: codelab-architecture
tags: [security, tools, safety]
priority: 950
---

# 工具安全规范

## 1. 路径安全

- 所有文件路径在执行前必须使用 `path.resolve` 规范化。
- `read_file` 禁止读取常见敏感文件（如 `.env`、SSH 私钥、`.npmrc`）。
- `write_file` 覆盖已有文件前必须请求确认（除非 `--no-confirm`）。

## 2. 命令执行安全

- `bash` 工具必须内置危险命令黑名单，例如：
  - `rm -rf /`
  - `mkfs.*`
  - `dd if=... of=...`
  - `>:...` 等重定向覆盖系统文件的操作
- 可配置命令白名单，默认允许常见开发命令（`git`、`npm`、`node`、`pnpm`）。
- 命令超时必须有默认值，避免长时间挂起。

## 3. 敏感信息保护

- 日志、错误信息、工具返回结果中不得打印 API Key、密码、Token。
- 读取配置时，对 `apiKey` 字段做脱敏处理再输出。
- 命令行历史不应保存 `--api-key` 参数；建议用户改用环境变量。

## 4. 网络请求

- 调用外部 API 时要有超时与重试机制。
- 默认不发送用户文件内容到外部服务；如需发送，必须明确告知用户。

## 5. 权限最小化

- 工具默认只读优先，写操作需要更高等级的确认。
- 不建议在 root 或管理员权限下运行 codelab-sage。
