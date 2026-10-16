# HarmonyOS driver verification

## Reproduce the automated checks

From `plugins/opengui`, run `pnpm check`, `pnpm package`,
`bash -n scripts/install-macos.command`, and `node scripts/test-installer.mjs`.
The existing CI matrix covers Linux, macOS arm64 and macOS Intel. Local macOS
results do not establish that the remote matrix has passed.

The tests cover Android regressions, HDC failure acknowledgments and argument
quoting, device identity, layout limits and changes, coordinate scaling,
API-dependent text input, permission assessment, cancellation and owned artifact
cleanup. Android still requires video readiness; HarmonyOS explicitly rejects
Android video preparation and opens a screenshot session.

## Device evidence

Historical physical-device verification used a TYR-AL00 at API 24, HDC 3.2.0d,
and UiTest 6.0.2.3. It exercised observation, launch, Unicode input, long press,
navigation, cancellation and session cleanup. Those records predate the current
upstream merge and do not establish verification of this candidate.

Current candidate: device smoke verification is pending. Record the candidate
commit, device/API/tool versions, the short workflow and observed result here
after running it. Do not attach private app screenshots or application-specific
release archives.

Suggested short workflow: open a screenshot session, observe the actual phone,
perform ordinary authorized navigation, inspect the returned image, then close
the session and verify that its owned runtime artifacts are removed. Do not send
messages or delete unrelated data to prove driver behavior.

API 17 hardware, physical multi-device operation, landscape/foldable layouts,
actual unplug/reconnect, protected screens and long-running unattended operation
are unverified. These limits should be disclosed rather than expanded into a
claim that every supported phone or business workflow has passed.
