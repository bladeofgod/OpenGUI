# PR 草稿：修复原生确认结果处理

候选：`fix/native-confirmation-reply`。目标：上游 `main`。

## What changed?

显式保存 AppleScript 弹窗返回值，避免检查超时标志后隐式 `result` 被覆盖，
导致用户选择 Allow once 却得到取消。区分用户取消、超时和界面不可用；错误
信息不携带原始进程参数。Android 文案及逐次授权方式保持原有语义。

## Why?

上游脚本使用模拟弹窗返回 `{button returned:"Allow once", gave up:false}`
运行实际 AppleScript 时得到 `cancel`。相同场景在修复后的实际脚本中返回
`Allow once`。复现不创建真实弹窗，也不操作设备。

## Testing

- `pnpm check`：16 个文件、101 项测试通过，TypeScript、CLI 构建及暂存校验通过。
- `pnpm package`、安装器 shell 语法及隔离打包安装检查通过。
- AppleScript 回归涵盖允许、超时、取消与界面错误；进程测试涵盖取消信号及
  失败信息脱敏。macOS 专属 AppleScript 用例在其他宿主跳过。
- 本机 Node.js 24.15.0、pnpm 10.31.0；远端规定版本的三平台 CI 待运行。

## Device verification

这次验证不操作手机。实际 macOS AppleScript 通过模拟弹窗结果执行；没有把
模拟结果报告为用户真实点击过系统授权框。

## Notes

仅三个插件源文件/测试文件，不引入鸿蒙驱动、精简输出或测试清理授权。
安装器验证使用隔离宿主 fixture 和经过 SHA-256 校验的官方视频资源缓存。
