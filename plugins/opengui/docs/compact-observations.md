# Compact observations and complete evidence

Use `--compact` before the interface name:

```sh
node lib/cli.js --compact opengui_observe '{"sessionId":"returned-session-id"}'
```

The compact response preserves the current observation ID, JPEG coordinate space,
layout stability, focused editable nodes and action assessment. It is primarily
useful for HarmonyOS advisory layouts. Non-observation results and results without
layouts remain unchanged. Do not interpret omitted nodes as absent elements.

Complete observations are written to `observationPath` with owner-only read/write
permissions. The JSON references the screenshot file without embedding its base64
bytes. It can contain hidden advisory node text: keep it private and query only
necessary fields. Default CLI output remains complete.

Closing or cancelling a session removes its JPEG and JSON together. Expired
session directories retain the existing pruning policy. Copy authorized evidence
before closing. If the host reports a running process, wait for that same process;
do not parse partial output or repeat an uncertain action.

Before trying a changed source build, finish old sessions and stop its idle daemon;
use a dedicated runtime directory during development. These source changes do not
claim that an already published package has been upgraded.

Automated and physical-device candidate results are recorded in the contribution
preparation plan. Device verification for this output change is pending.
