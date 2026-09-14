# 参与贡献

欢迎通过 Issue 反馈问题、讨论改进，或提交 Pull Request。讨论和界面文案以中文为主，代码标识使用英文。

## 本地开发

使用 `.nvmrc` 指定的 Node.js 版本。在项目根目录运行：

```bash
nvm use
npm ci
npm run dev
```

没有 nvm 时，可自行安装 Node.js 22.22.2。安装与更新步骤见 [安装说明](docs/INSTALLATION.md)。

## 提交前

```bash
npm run check
```

该命令依次运行测试、ESLint、Prettier、TypeScript 和 Raycast 构建。格式调整只针对修改的文件，例如 `npx prettier --write src/lib/dates.ts`，避免无关格式化。

- 修复计算或存储行为时补充能复现问题的测试；网络、日期和存储使用已有注入边界，测试不依赖实时假期接口。
- 修改界面后在 Raycast 中手工验证，PR 说明执行步骤、结果，以及未验证的内容。
- 保持扩展名称和现有存储键兼容；如需改变数据格式，先讨论迁移和回退方案。
- 新功能或明显行为变更，在 `CHANGELOG.md` 的 `Unreleased` 下记录。
- 不提交个人事件、备注、凭据、真实业务截图、`node_modules/` 或构建产物。

`npm run lint:raycast` 是面向 Raycast Store 的额外联网元数据检查，不属于当前 GitHub CI 的必需步骤；本项目尚未提交 Store。

## 提交 PR

从 `main` 创建主题分支，描述问题、修改后的行为和验证方式。一个 PR 聚焦一个改动，尽量沿用已有依赖和结构。提交贡献表示同意按本项目 MIT 许可证提供这些改动。

发布由维护者按 [发布说明](docs/RELEASING.md) 操作。
