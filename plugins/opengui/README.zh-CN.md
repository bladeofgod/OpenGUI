# OpenGUI Codex 独立插件

仅支持 macOS arm64/x64 上的本地 Codex，用截图驱动 Android / HarmonyOS 操作并提供只读设备墙。
当前是候选源码包，不代表已发布或通过公开目录审核。

- 与生产 DSH 完全分开维护源码、依赖、版本和发布流程，不改动或重载 DSH。
- 首次使用原生弹窗确认下载固定 Node 运行时，校验后保存在独立目录；不改系统 PATH。
- 最多冻结四台测试设备；只读监控不占控制锁。
- 发送、发布、购买、删除默认需要对话确认和原生单次确认。用户明确批准的 HarmonyOS 测试历史清理可使用下述有界任务授权。
- 取消/关闭清理会话截图；空闲会话 30 分钟过期，空闲守护进程 5 分钟退出。

## 测试历史清理任务授权

项目宿主在用户批准后，将私有授权写入运行目录 `task-grants/<grantId>.json`（目录 0700、文件 0600、当前用户所有、禁止符号链接）。`opengui_open_session` 可携带 `testCleanupGrant: {grantId, runId, specDigest}`，同时明确指定唯一设备和 control 模式。没有新增公开工具，也不接受客户端传入的批准布尔值。

授权使用 `schemaVersion: 1` 和 `profile: "test-history-cleanup-v1"`，绑定宿主任务 owner、HarmonyOS、deviceId、bundleName、caseId、specDigest、issuedAt/expiresAt、maxDeletes、context（historyHeading/inputHint）及 runs（runId/texts）。有效期最多一小时、最多三个 run、每个 run 恰好两个完整测试字符串（ASCII 和 Unicode）、总删除预算最多六次。时间仅接受 UTC 的 Z 或 +00:00。宿主负责从已批准的测试规范生成授权；插件不自行创建授权。

每个 run 在打开会话前持久占用，打开失败也不能复用。插件只承认从本会话首次无历史、唯一聚焦空编辑字段开始输入，并随后观察到完整精确字段值的测试文本。后续输入允许已证明由本会话创建的历史。清理仅允许最新完整稳定观察中的搜索历史条目 `long_press`；目标框必须严格位于唯一完整文本框内，历史后缀不得包含未知文本。每条文本只消费一次，预算在执行前持久扣除，失败或结果不明均不退款。

修改、删除授权文件或权限不再私有会撤销授权。越界、过期、重复 run、模糊观察均直接阻断，错误为 `opengui: test cleanup grant scope denied`，不回退弹窗。普通未绑定授权的会话保留原生单次确认。该机制防止任务混用；与现有 owner 协议一致，不防范同一系统用户恶意伪造宿主身份或改写私有状态。

输入后占位提示可能消失：非空字段可使用空 hint，但必须仍与输入前字段的类型、窗口、应用、屏幕尺寸及位置对应；允许清除按钮造成右侧有限缩短。待权限处理或未确认输入的观察不建立文本归属。

原会话中断后的单条清理使用 `test-history-cleanup-recovery-v1`，由受信准备角色核对保存的原 run 证据后签发。它保留基本字段，增加 `source: {grantId, runId, deviceId, grantDigest, proofDigest}`，只允许一个恢复 run、一个已证明的原测试文本、`maxDeletes: 1`；期限最多十分钟且不能超过原授权。caseId/specDigest 对应恢复规范，source 对应原授权，其中 deviceId 必须匹配原授权的旧设备标识，基本字段 deviceId 则绑定当前会话的新设备标识。准备角色通过原 run 与当前预检中的物理设备序列号和型号验证是同一部手机，将旧/新标识及证据摘要纳入证明；插件不独立验证物理序列号。proofDigest 是准备角色对项目证据验证的断言，不表示插件独立重放验证了项目事实。

恢复 claim 核对原授权哈希、任务/平台/设备/应用/搜索区域、已占用原 run 与文本，并独占占用该原 run/文本的恢复标记、预扣原授权的一次删除额度；打开失败仍不退款。恢复会话禁止输入文本，当前历史区域、精确文本及目标框检查仍全部执行，自身最多删除一次。重新签发另一 grant 不能恢复同一个原 run/文本；修改或删除原授权也会撤销恢复授权。

前次恢复仅观察后关闭、完全没有 `opengui_act`，且授权已过期时，用户重新明确授权后，受信准备角色可签发一次续接。它仍使用 recovery profile，增加 `continuation: {grantId, runId, grantDigest, proofDigest}` 指向前次恢复，source 全字段保持原值。准备角色核对正式关闭报告、零动作及零不明结果、原创建证据、同物理设备和本次新授权，并将 sessionId 和证明细节写入私有证明；插件不声称独立验证这些项目事实。

续接授权必须当前有效且最多十分钟，可以晚于历史原授权和前次恢复的期限，但不修改它们。插件核对前次授权哈希、原 source、唯一文本、run 占用、无活跃前次会话、无 `acted` 或删除标记，再独占写入前次 run 的后继标记，复用原来已预扣的一次额度。所有恢复会话在任何动作前先持久记录 `acted`（包括聚焦等普通动作），与后继标记互锁；动作失败、不明或曾尝试动作的恢复均不能续接。当前只接受前次不含 continuation 的单跳续接，禁止自动续接链；旧版恢复是否确实零动作由受信准备角色核对完整请求记录。

## 本 fork 的鸿蒙适配

鸿蒙功能位于本目录的电脑端 CLI/驱动，使用本机 DevEco Studio 的 HDC 和手机内置 UiTest。
源码构建后设置 `OPENGUI_PLATFORM=harmonyos`，详见 [鸿蒙接入与验证](docs/harmonyos.md)。
现有 DSH、WorkBuddy 和 Android APK/服务端链路的鸿蒙移植不属于此实现。

## 普通用户安装

正式发布后，从对应 [Codex Release](https://github.com/Core-Mate/OpenGUI/releases) 下载
`opengui-codex-版本-install.command` 及其 `.sha256`，在下载目录校验后运行：

```sh
shasum -a 256 -c opengui-codex-0.1.0-install.command.sha256
bash opengui-codex-0.1.0-install.command
```

安装器自动下载并校验预构建包、准备私有 Node、注册独立插件来源。需要带插件管理功能的
Codex CLI，不需要 Git、pnpm、Xcode 或源码构建。完成后新开对话，选择 OpenGUI，先说
“列出已连接手机，不操作手机”。USB 授权仍需在手机上批准。

也可让 Agent 使用仓库的 [安装 Skill](../../skills/opengui-plugin-install/SKILL.md)，
说“帮我安装 OpenGUI Codex 插件”。它会自动查找匹配的正式版本并校验安装文件。
当前尚未正式发布；没有完整 Release 时会明确停止，不会偷偷转为源码构建。

升级前结束旧任务。同名插件冲突会提示，不会自动移除。旧包和配置备份保存在
`~/.codex/opengui-codex/packages`，使用 `CODEX_HOME` 时跟随该目录。回退可运行旧版本安装器。

维护者测试候选包：`bash scripts/install-macos.command --archive /绝对路径/opengui-codex-0.1.0.tar.gz`，
同目录需有归档的 `.sha256` 文件。

## 开发者构建

开发时在本目录运行 `pnpm install --frozen-lockfile --ignore-scripts`、
`pnpm check` 和 `pnpm package`。打包产物位于 `.artifacts/`。
原仓库 marketplace 保持原样，安装器自动使用独立来源，不要求用户自行搭建 marketplace。

会话操作使用宿主提供的 `CODEX_THREAD_ID` 绑定当前任务，缺少该身份时拒绝执行。
会话列表仅返回当前任务的会话；设备墙令牌也按会话隔离。此机制防止任务间误操作，
不防御能伪造环境变量或读取本地文件的同用户恶意进程。动作失败后必须重新观察，
旧截图凭据不可重用；同一手机重连后保留身份。协议已升级为 3，旧守护进程须先
完成会话并退出，再使用新版。

首次使用运行 `sh scripts/opengui --setup`，随后运行 `--doctor`。
ADB 服务不存在时，`--setup-adb-server` 在原生确认后启动；已有服务不兼容时拒绝，
不会自动重启。ADB 和手机仍是共享资源，不能保证跨宿主互斥，
因此不要在生产 DSH 主机或正在被其他程序控制的手机上验收。

完整使用方法、异常恢复和回退步骤见 [English README](README.md)；
数据边界见 [隐私说明](docs/privacy.md)。自动化检查、真机验收、GitHub Release、
提交审核、审核通过和正式上架须分别确认。
