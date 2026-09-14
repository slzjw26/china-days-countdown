# 维护与发布

首版为 `v0.1.0`。`0.x` 表示项目仍在早期迭代，并不表示不能日常使用。修复发布 `0.1.1` 等修订版本，增加功能发布 `0.2.0` 等次版本；等功能边界、升级方式及兼容性约定稳定后，再考虑 `1.0.0`。

当前流程仅支持 `v主版本.次版本.修订版本` 正式标签，不自动发布预览标签。

## 自动检查

- 分支 push 和 PR：运行 `npm ci`、`npm run check`。
- 推送版本标签：先执行相同检查，再核对标签、`package.json`、lockfile 版本和 CHANGELOG 条目。
- 检查通过后：从标签对应的 Git 提交生成源码 ZIP、SHA-256 校验文件，并创建 GitHub Release。
- 构建检查与发布分属不同 job。只有创建 Release 的 job 具有 `contents: write`；npm 依赖安装和测试在只读权限 job 中运行。

源码包由 `git archive` 从标签对应提交生成，不取本机未提交内容。ZIP 包含公共项目文件，不包含本地依赖、构建产物及被 Git 忽略的开发记录。它需要源码导入 Raycast，不是 `.raycast-extension` 安装包。

## 发布步骤

1. 确认功能改动已合入 `main` 并完成 Raycast 手工验收。在干净工作区同步最新 `main`，然后创建发布准备分支。
2. 更新版本，例如 `npm version 0.1.1 --no-git-tag-version`。该命令同时更新 package 和 lockfile，但不会自动提交或打标签。
3. 将 `CHANGELOG.md` 的待发布内容整理成 `## [0.1.1] - YYYY-MM-DD`，保留空的 `Unreleased`。说明新增行为、修复、已知限制，以及任何数据兼容性变化。
4. 执行 `npm run check` 和 `npm run release:check -- v0.1.1`，审查并提交版本文件。推送准备分支并创建 PR；`check` 通过、分支与最新 `main` 同步且讨论全部解决后，以 Squash 合入。不要直接推送 `main`。
5. 回到本地 `main`，快进同步后确认它对应刚才的 Squash 合并提交。在该提交上打附注标签并推送：

   ```bash
   git switch main
   git pull --ff-only origin main
   npm run release:check -- v0.1.1
   git tag -a v0.1.1 -m "Release v0.1.1"
   git push origin v0.1.1
   ```

6. 在 Actions 查看 Release workflow；成功后在 Releases 核对版本、说明、源码 ZIP 和 `SHA256SUMS`，下载到空目录后运行 `shasum -a 256 -c SHA256SUMS`。

本地验证打包可在已有标签的对应提交上运行 `npm run release:package -- v0.1.1`。产物在 `.release/`，该目录不提交 Git。打包工具要求当前 HEAD 与标签指向相同提交，并核查提交内的版本及更新记录。

仓库禁止修改或删除 `v*` 标签，仍允许创建新版本标签。已开启不可变 Release：后续发布的附件和关联标签会被锁定，标题与发布说明仍可编辑。现有发布命令先创建草稿、上传附件，再正式发布，与这一设置兼容。开启设置前发布的 `v0.1.0` 附件不会自动变为不可变，但其标签已受 `v*` 规则保护。

## 发布失败

- 测试或版本校验失败：若需要修改代码，修复后通过 PR 合入，再使用新的修订版本标签；已推送的 `v*` 标签不能移动或删除。仅网络等临时故障且无需改动源码时，可以重跑原工作流。
- GitHub Actions 权限被组织策略限制：核对仓库 Actions 设置是否允许 workflow 申请 `contents: write`。无需把个人 token 写进仓库。
- 工作流重复执行而 Release 已存在：发布会拒绝覆盖，先核查已有 Release 及资产。公开资产需要更正时，优先发布新修订版本并解释原因。
- 安装问题：保留诊断信息与版本号，在本地重现；不要把个人事件或备注放进日志、Issue 或 Release notes。

## 手工验收范围

创建自然日与工作日事件；从假期月历选日并返回；添加、清空备注；编辑边界选项；关闭重开列表；切换自动/固定菜单事件；核对假期、补班和估算提示。自动测试覆盖核心逻辑及发布工具，不替代 Raycast 原生 UI 和不同机器上的安装验证。
