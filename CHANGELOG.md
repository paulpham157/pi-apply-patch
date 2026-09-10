# Changelog

## 0.1.3

- Publish the distribution as @paulpham157/apply-patch.
- Enable apply_patch for every model, replacing native edit/write tools.
- Support grammar calls where available and JSON function calls otherwise, using Pi >=0.85.1.
- Validate the entire patch before writing; confine paths to cwd and reject symlinks, existing add/move destinations, and overlapping paths.
- Include examples for creation, updates, direct moves, and deletion, with actionable syntax errors.

## Earlier versions

- Initial standalone apply_patch extension with GPT-family activation.
- Support custom openai-responses and openai-codex-responses providers.
