# Universal patch verification

Verified locally on 2026-09-09 with Node 22.23.0 and Pi packages 0.85.1.

- `npm test`: 93 tests passed across four files, including executable tool-description examples and an actionable diagnostic for invalid move headers.
- `npm run check`: strict type checking and Biome passed. Biome reports an existing configuration deprecation notice.
- `git diff --check`: passed.
- `npm pack --dry-run --cache /tmp/pi-apply-patch-npm-cache`: package contents validated.
- Codex grammar and the JSON input schema remain byte-for-byte unchanged from implementation baseline `8f0d8a6`.

Transport tests use the installed Pi Responses, Anthropic, and Google request builders, inspect their payloads, and stop before network activity. Responses selects grammar or JSON according to capability; Anthropic and Google emit the JSON function schema. These tests do not establish live provider acceptance or model patch quality.

User-reported smoke tests with `muse-spark-1.3-contributor-free` through `opencode` succeeded for creation, update, and deletion. The model recovered from an invalid Add File patch but attempted an unsupported Move File header, then used Add + Delete instead. Direct move and transport selection were not verified by those logs. The tool description now includes all four operation examples and explicit direct-move guidance; another live smoke test is needed to assess the improvement.

Filesystem tests cover whole-patch validation, escaping paths, symlinks, existing destinations, overlapping paths, hard-link aliases, case-only aliases, concurrent creation, and stopping after a write-time collision. Parser regressions reject stray text without changing files. No whole-patch rollback or protection against external filesystem races is claimed.

The lockfile update follows the Pi 0.78.1 to 0.85.1 peer dependency graph. Pi 0.85.1 pins new provider SDK versions and includes its dependency shrinkwrap; no non-peer package version changed relative to the baseline.
