# pi-apply-patch

One `apply_patch` tool for all model families in Pi **0.85.1 or later**. It replaces native `edit` and `write`, including after model switches, while preserving other active tools such as `bash`.

## Usage

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

## Origin and license

Forked from [code-yeongyu/pi-apply-patch](https://github.com/code-yeongyu/pi-apply-patch), originally extracted from `code-yeongyu/senpi-mono`. The patch grammar is retained; activation, transport metadata, descriptions, and file safety intentionally differ.

[MIT](LICENSE).
