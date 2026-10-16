# PR 草稿：独立 Codex 插件接入鸿蒙截图驱动

已发布：[PR #142](https://github.com/Core-Mate/OpenGUI/pull/142)。
源码：`feat/harmonyos-driver-contribution@a4eaac0`，目标为上游 `main`。
投稿标题：`feat(codex): add HarmonyOS HDC and UiTest driver`。
以下保留原投稿正文，实际发布格式及后续审核以 GitHub 为准。

## What changed?

**Depends on #141.** This stacked PR adds optional `OPENGUI_PLATFORM=harmonyos` support to the standalone Codex plugin using local SDK HDC and device UiTest.

The driver covers discovery, screenshots, advisory layouts, input, navigation and owned artifact cleanup. Android remains the default and retains its video-readiness gate; HarmonyOS uses screenshot sessions.

The current `main` comparison includes the prerequisite confirmation fix: 3 commits and 37 files. The [HarmonyOS-only comparison](https://github.com/bladeofgod/OpenGUI/compare/fix/native-confirmation-reply...feat/harmonyos-driver-contribution) isolates this feature's 36 files.

## Why?

A native HarmonyOS test phone can reuse Codex sessions, device locks, budgets and screenshot-based GUI operation through an opt-in local driver. The scope is the standalone plugin.

## Testing

- First full run: 134/135 passed; an unchanged launcher fixture timed out. All 8 launcher tests passed on focused retry without relaxing timeouts.
- TypeScript/CLI build, validation, packaging, installer syntax and isolated packaged-install checks passed.
- Coverage includes HDC acknowledgments, quoting, layout changes/limits, coordinate scaling, input, cancellation and cleanup.
- Local macOS arm64 / Node.js 24.15.0 / pnpm 10.31.0 results are separate from remote pinned-version CI.

## Device verification

2026-10-16, source `371481a`, TYR-AL00, HDC 3.2.0f: opened a screenshot session, observed the launcher, swiped to an adjacent page and back with image verification, then closed the session and verified screenshot removal. The capability probe passed; the current API/UiTest versions were not separately recorded.

Android hardware, API 17 hardware, multiple physical devices and unattended soak were not checked in this smoke test.

## Notes

Merge order: #141, then this PR. Please advise how this should align with shared-runtime work in #104, and clarify the plugin MIT declaration versus root contributor licensing terms. Advisory nodes never replace screenshot verification. Raw device content is not attached.
