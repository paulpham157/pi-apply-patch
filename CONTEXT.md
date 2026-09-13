# Universal Patch Tool

This context describes one patch tool intended for use across model families in Pi.

## Language

**Universal apply_patch**:
A shared file-change tool intended for every selected model family. Universal availability does not imply equal patch quality across models.
_Avoid_: Codex-only tool

**Patch**:
A description of file additions, updates, deletions, or moves bounded by `*** Begin Patch` and `*** End Patch`.
_Avoid_: Replacement string

**Patch validation**:
The check of every operation in a patch for valid syntax, permitted paths, and matching file context before any file is changed. Successful validation is not a guarantee that subsequent filesystem writes will succeed.
_Avoid_: Atomic transaction

**Workspace**:
The Pi session working directory and the files within its boundary. The enclosing Git repository does not expand this boundary, and symlinks do not grant access outside it.
_Avoid_: Repository root

**Dry-run preview**:
A validation-only run of a patch that returns the rendered preview without changing any file. A successful dry run means the patch passes validation, not that a later real run will succeed.
_Avoid_: Rollback
