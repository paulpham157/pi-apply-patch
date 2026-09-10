# apply-patch

One `apply_patch` for every model on Pi: GPT, Claude, Gemini, DeepSeek, Kimi, GLM, Qwen, and others. The extension replaces `edit`/`write`, choosing the grammar or JSON function tool based on provider capability.

Repo: [https://github.com/paulpham157/pi-apply-patch](https://github.com/paulpham157/pi-apply-patch)

## Install

Requires Pi >=0.85.1 and Node >=22.

```bash
pi install npm:@paulpham157/apply-patch
```

If Pi is running, use `/reload`. The extension activates automatically and keeps working across model switches.

## Features

- Create, edit, delete, and move files with a single patch tool.
- Confines paths to `cwd`; rejects symlinks, existing destinations on create/move, and overlapping path operations.
- Validates the full patch before writing; no full rollback on filesystem write errors.

Read a file before editing it; on patch failure, re-read the relevant region and generate a new patch. Patch usage quality varies by model. `bash` still works and is not subject to this tool's path limits.

## Contributing and support

Read [CONTRIBUTION.md](CONTRIBUTION.md), [AGENTS.md](AGENTS.md), and run the required tests before opening a PR. See [live testing with Pi](docs/live-testing.md) and [releasing](docs/releasing.md).

Issues? Open one [here](https://github.com/paulpham157/pi-apply-patch/issues/new/choose) with the Pi version, provider/model, and reproduction steps. Do not attach API keys.

Quick create: [Bug report](https://github.com/paulpham157/pi-apply-patch/issues/new?template=bug.yml) · [Model/provider issue](https://github.com/paulpham157/pi-apply-patch/issues/new?template=compatibility.yml) · [Feature request](https://github.com/paulpham157/pi-apply-patch/issues/new?template=feature.yml).

Forked from [code-yeongyu/pi-apply-patch](https://github.com/code-yeongyu/pi-apply-patch): at the time, upstream had no updates for ~2 months and only supported `gpt-*` models, so this fork was created for personal use. [MIT](LICENSE) license.
