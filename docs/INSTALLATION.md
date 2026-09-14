# 安装与升级

这是通过源码导入的 Raycast 扩展，目前没有 Raycast Store 安装入口，也没有双击即可安装的扩展包。无需 Raycast Pro。

## 环境

- macOS 和已安装、登录的 Raycast。
- Node.js 22.22.2（与 `.nvmrc` 和 CI 一致）及 npm。使用 nvm 时运行 `nvm install && nvm use`。
- 首次安装需要联网下载 npm 依赖；中国工作日计算也需要获取公共假期数据。

## 安装指定版本

在 GitHub 项目的 **Releases** 页面下载 `china-days-countdown-0.1.0-source.zip` 和 `SHA256SUMS`，将它们放在同一个目录。可先验证下载完整性：

```bash
shasum -a 256 -c SHA256SUMS
unzip china-days-countdown-0.1.0-source.zip
cd china-days-countdown-0.1.0
npm ci
npm run dev
```

在 Raycast 搜索“查看倒计时”或“创建倒计时”。没有出现时，运行 Raycast 的 **Import Extension**，选择包含 `package.json` 的项目根目录，再运行 `npm run dev`。

`npm run dev` 负责本地导入和监视源码。安装后可按 Ctrl+C 停止监视；使用扩展时需要 Raycast 运行。重新修改或升级源码后，应再次执行导入命令。`dist/` 仅是构建输出，不是源码导入目录。

若通过 Git 克隆项目，可在项目目录运行 `git switch --detach v0.1.0` 后执行 `npm ci` 和 `npm run dev`，以安装与 Release 一致的版本。

## 升级与回退

1. 先阅读目标版本的 Release notes，确认有无数据或安装方式变化。
2. 停止旧的 `npm run dev` 进程，保留原项目目录作为源码回退副本。
3. 下载并解压新版本；执行 `npm ci` 和 `npm run dev`，保持 `package.json` 中的扩展名称 `china-days-countdown` 不变。
4. 打开列表确认已有事件、备注及菜单栏选择；启用菜单栏的用户再运行一次“倒计时菜单栏”。

Git 安装且没有本地改动时，可用以下方式选择新版本（用真实目标标签替换 `vX.Y.Z`）：

```bash
git fetch origin --tags
git switch --detach vX.Y.Z
npm ci
npm run dev
```

不要为了升级先删除 Raycast 中的扩展或清除其数据。当前版本没有导出备份功能，升级前可自行记录重要事项；源码副本并不包含 Raycast 内的事件数据。

源码回退使用同样步骤安装旧标签或旧 ZIP。未来若版本说明包含数据迁移，应先确认旧版仍能读取新格式，不能仅凭源码能够回退就认为数据一定兼容。

## 常见问题

- **Node 版本提示不满足要求**：运行 `node --version`，切换到 `.nvmrc` 指定版本，再执行 `npm ci`。
- **下载依赖失败**：确认 npm registry 和网络可用后重试 `npm ci`，不要提交含私有 registry 凭据的配置。
- **出现“估算”**：打开假期日历查看所需年度是否缺失，尝试刷新；未来年度可能尚未公布。
- **菜单栏没有出现**：运行“倒计时菜单栏”，允许 Raycast 后台刷新，并检查 macOS 菜单栏是否还有空间。
- **删除扩展后事件消失**：数据保存在 Raycast 的本地扩展存储，源码或 Release 不包含这些数据，重装无法保证恢复。
