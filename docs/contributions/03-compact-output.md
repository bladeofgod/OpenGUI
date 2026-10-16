# PR 草稿：精简观察输出并保留完整私有证据

候选：`feat/compact-observation-contribution`。目标：上游 `main`，现在即可提交。
建议标题：`feat(codex): add compact observations with private JSON evidence`。
复制下面五个模板章节作为正文；鸿蒙前置 PR 用分支名明确标识，未猜测编号。

## What changed?

**Depends on #141 and the HarmonyOS driver PR from `bladeofgod:feat/harmonyos-driver-contribution`.** This stacked PR adds optional `--compact` observation output and owner-only complete JSON evidence at `observationPath`.

Compact output retains observation IDs, screenshot coordinates, layout stability, focused inputs and action assessment. Default output stays complete; JPEG and JSON follow the same session cleanup lifecycle.

The current `main` comparison includes both prerequisites: 5 commits and 41 files. The [compact-output-only comparison](https://github.com/bladeofgod/OpenGUI/compare/feat/harmonyos-driver-contribution...feat/compact-observation-contribution) isolates this feature's 12 files.

## Why?

Large advisory layouts can exceed terminal output limits. Compact results keep the next-action context parseable while complete observations remain available for targeted reads. Results without layouts stay unchanged.

## Testing

- `pnpm exec vitest run --maxWorkers=2`: all 138 tests across 22 files passed.
- `pnpm build`, `pnpm validate`, `pnpm package`, installer syntax and isolated packaged-install checks passed.
- Tests check JSON permissions/content, compact/default responses and session cleanup. CLI integration runs on supported macOS hosts.
- Local Node.js 24.15.0 / pnpm 10.31.0 results are separate from remote pinned-version CI. Assertions and timeouts were not relaxed.

## Device verification

2026-10-16, source `386e81e`, TYR-AL00: opened a screenshot session and inspected a compact observation. Its complete JSON retained 104 layout nodes with mode 0600 and matching observation/screenshot metadata. Closing the session removed JPEG and JSON. This check verified output and cleanup without repeating the driver's navigation smoke test.

## Notes

Merge order: #141, HarmonyOS driver, then this PR. Omitted compact nodes do not establish that an element is absent. Complete JSON can contain hidden advisory text and must remain private; raw device results are not attached.
