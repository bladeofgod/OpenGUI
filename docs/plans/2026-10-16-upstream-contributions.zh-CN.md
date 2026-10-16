# OpenGUI 上游贡献准备计划

日期：2026-10-16。工作仓库：`bladeofgod/OpenGUI`。

## 同步基线与分支用途

本轮重新获取 `origin/main`、`origin/feat/harmonyos-uitest` 和 `upstream/main`。
三方核对结果：`main` 均为 `8a681b4`；集成分支 `feat/harmonyos-uitest`
的 `b32e27e` 已包含该提交。因此不创建重复合并，也不重写原有鸿蒙历史。

`feat/harmonyos-uitest` 保留完整日常使用能力和历史验收记录。投稿分支只取
对应功能需要的代码、通用文档和测试；本计划及投稿草稿留在集成分支，不混入
上游功能差异。

## 贡献依据

- [CONTRIBUTING.md](../../CONTRIBUTING.md)：一个 PR 一个功能或修复，说明问题、
  用途和测试；设备行为变化应提供真机验证。
- [PR 模板](../../.github/pull_request_template.md)：按 What changed / Why /
  Testing / Device verification / Notes 编写。
- [项目契约](../../CLAUDE.md)：保持公开发布边界、默认 Android 行为和已有保护。
- 上游 [PR #104](https://github.com/Core-Mate/OpenGUI/pull/104) 正在提取共享执行内核。
  鸿蒙投稿前沟通扩展应基于 `main` 还是后续共享运行时，避免重复抽象。

## 拆分结果与依赖

| 顺序 | 候选分支 | 本地审查基线 | 投稿范围 |
| --- | --- | --- | --- |
| 1 | `fix/native-confirmation-reply` | `upstream/main` | 原生确认响应及错误处理，两个测试文件 |
| 2 | `feat/harmonyos-driver-contribution` | `fix/native-confirmation-reply` | HDC/UiTest、平台驱动、截图会话、通用中英文说明 |
| 3 | `feat/compact-observation-contribution` | `feat/harmonyos-driver-contribution` | `--compact`、完整私有 JSON、清理生命周期及测试 |

候选头提交：原生确认 `34ec75c`，鸿蒙驱动 `a4eaac0`，精简输出 `3d94a02`。

这是有依赖的候选序列，不是三个都直接对 `main` 打开的大 PR。第一项合入上游
后，第二项重新基于上游整理；第二项合入后再提交第三项。逐份检查差异，保证
已经合入的前置改动不会再次出现在下一份 PR 中。候选分支不包含本项目 1.1.8
验收归档、测试清理授权、机器缓存或原始设备画面。

审查命令：

```sh
git diff upstream/main...fix/native-confirmation-reply --stat
git diff fix/native-confirmation-reply...feat/harmonyos-driver-contribution --stat
git diff feat/harmonyos-driver-contribution...feat/compact-observation-contribution --stat
```

## 验证安排与结果

只验证发生变化的独立插件，不重新构建没有差异的服务端或 Android 客户端。
候选分支的测试数包含继承用例，不能把三个分支的数量相加作为新增覆盖率。

| 候选 | 自动化结果 | 构建与分发检查 | 本轮设备检查 |
| --- | --- | --- | --- |
| 原生确认 | 101 项通过；上游模拟“允许一次”返回 `cancel`，修复后的实际 AppleScript 模拟返回正确结果 | 构建、校验、打包、安装器语法与隔离安装通过 | 无真实手机动作；使用模拟弹窗结果验证实际 AppleScript，不冒充真实弹窗点击 |
| 鸿蒙驱动 | 首轮 134/135 通过，一项未改动的启动器测试超时；该文件 8 项定向复验全部通过 | 构建、校验、打包、安装器语法与隔离安装通过 | 代码基线 `371481a`，TYR-AL00、HDC 3.2.0f；观察、左右翻页恢复、会话截图清理通过 |
| 精简输出 | 22 个文件、138 项全量通过，使用两个 worker；未放宽超时或断言 | 构建、校验、打包、安装器语法与隔离安装通过 | 代码基线 `386e81e`，TYR-AL00；精简响应、完整 JSON 的 104 节点与 0600 权限、JPEG/JSON 关闭清理通过 |

本机使用 Node.js 24.15.0、pnpm 10.31.0 与现有锁定依赖。为避免自动切换包管理器
修改共享依赖，检查时设置 `npm_config_manage_package_manager_versions=false`。
上游 CI 使用 Node.js 22.23.2、pnpm 11.19.0，Linux/macOS arm64/macOS Intel
三平台结果仍须在远端单独获取。本机通过不等同于远端 CI 通过。

集成分支同时补回一项宿主范围修正：CLI 集成测试只在受支持的 macOS 上执行，
避免 Linux CI 因产品本身拒绝 Linux 控制而失败。对应 daemon 文件 11 项定向
测试通过；不改变生产控制逻辑。

安装器首次通过 Node 下载官方 scrcpy 文件时超时。随后使用 curl 获取同一官方
文件，核对固定 SHA-256，并经实际缓存安装器再次验证后复用；隔离安装器检查
使用该缓存以及 fixture Codex/Node，不修改当前已安装插件或其他宿主配置。

设备短流程只证明当前候选的截图控制与资源清理链路。API 17 真机、Android
真机、多设备、长期运行及其他业务流程没有因此被标为通过；也不重跑历史业务
验收。原始设备内容和本机检查日志不进入投稿内容。

## 投稿材料与后续顺序

1. 使用[原生确认草稿](../contributions/01-native-confirmation.md)提交第一份修复。
2. 使用[鸿蒙能力提案](../contributions/harmonyos-proposal.md)沟通架构落点和平台范围，
   确定后使用[鸿蒙 PR 草稿](../contributions/02-harmonyos-driver.md)。
3. 在前置功能合入后，使用[精简输出草稿](../contributions/03-compact-output.md)。
4. 测试清理授权留在 fork，先按[独立设计提案](../contributions/cleanup-grant-proposal.md)
   讨论其通用性、授权主体及审查方式。

本轮准备分支和草稿，不代替用户签署 CLA，也不视为维护者已接受平台扩展。
根贡献指南列有 BUSL-1.1、商用/再许可授权及较大外部贡献的 CLA 条款；独立插件
子目录另有 MIT 声明。正式投稿前由维护者澄清适用口径，由有权授权的人确认。

## 保持有效的边界

Android 继续使用原有视频首帧门槛。鸿蒙明确使用截图会话，拒绝 Android 视频
入口；控件树只作辅助，动作前查看截图并验证新观察。默认保留逐次原生后果操作
确认，鸿蒙驱动候选不携带清理授权例外。依赖、平台 SDK 和已安装插件均不作为
投稿源文件提交。
