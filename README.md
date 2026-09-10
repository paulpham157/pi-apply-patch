# apply-patch

[Repository](https://github.com/paulpham157/pi-apply-patch) · [Issues](https://github.com/paulpham157/pi-apply-patch/issues)

Universal `apply_patch` for **every model on Pi**, not just the `gpt-*` family. In the spirit of Pi's model-agnostic workflow, use the same patch tool with GPT, Claude, Gemini, DeepSeek, Kimi, GLM, Qwen, Muse, and other models available through Pi providers.

There is no model-name or provider allowlist. On Pi **0.85.1 or later**, the extension replaces native `edit` and `write` and stays active when you switch models, while preserving other active tools such as `bash`. Providers with grammar support receive grammar calls; others use the same patch engine through a standard JSON function tool.

## Installation

Requires Pi >=0.85.1 and Node >=22. Install the published package:

```bash
pi install npm:@paulpham157/apply-patch
```

To pin this release, use `pi install npm:@paulpham157/apply-patch@0.1.3`.

## Local development

```bash
npm install
pi -e ./src/index.ts
```

Reload an already running Pi session with `/reload` after changing the extension.

Provider capability determines the transport: Pi uses the unchanged Codex grammar where supported and a JSON function tool elsewhere. Both use the same patch engine. Tool availability does not guarantee equal patch quality across models.

```json
{"input":"*** Begin Patch\n*** Add File: hello.txt\n+Hello world\n*** End Patch"}
```

Grammar calls supply the patch directly. Patches support additions, updates, deletions, and moves; matching retains exact, trailing-whitespace, trimmed, and Unicode-normalized fallback behavior.

## File rules

- The session `cwd` is the workspace boundary. Absolute paths inside it are allowed. Paths outside it and paths through any symlink inside the workspace are rejected. The workspace root itself is canonicalized so OS directory aliases can still be used as `cwd`.
- Every operation is validated before writes begin. A syntax, path, or context error leaves every file unchanged.
- `Add File` and move destinations must not exist. Use `Update File` for existing files.
- Separate operations cannot overlap source or destination paths, including ancestor paths and existing file aliases. Names differing only by case are treated as overlapping even on case-sensitive filesystems. One update may contain multiple hunks and an attached `Move to`.
- Writes stop on the first filesystem error. There is no whole-patch rollback, and external processes can race filesystem checks. Confinement applies to this tool; `bash` remains unrestricted.

Read the relevant region before patching an existing file. After failure, inspect the reported error, re-read the relevant permitted region, and generate a corrected patch; do not retry the same failed patch unchanged.

## Development

```bash
npm test
npm run check
npm pack --dry-run
```

TypeScript strict mode, Node >=22, ESM imports with `.js` suffixes, tabs, double quotes. Tests cover tool registration/lifecycle and filesystem behavior. Live provider calls require separate verification; local tests do not establish model output quality.

Design decisions are in [docs/adr](docs/adr); vocabulary is in [CONTEXT.md](CONTEXT.md).

## Releases

After CI passes on Ubuntu, macOS, and Windows, semantic-release analyzes Conventional Commits on main, selects the next version, publishes to npm, and creates a GitHub Release when needed. See [release setup and recovery](docs/releasing.md) for the required npm Trusted Publisher configuration.

## Origin and license

Forked from [code-yeongyu/pi-apply-patch](https://github.com/code-yeongyu/pi-apply-patch), originally extracted from `code-yeongyu/senpi-mono`. The patch grammar is retained; activation, transport metadata, descriptions, and file safety intentionally differ.

[MIT](LICENSE).
