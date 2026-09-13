## Problem Statement

Model callers have no way to check whether a patch will pass validation before
changing files. A patch with a syntax error, a disallowed path, or mismatched
context fails mid-flow, and the model must re-read and regenerate after the
failure. A validation-only run lets the caller see the rendered preview (or the
same failure output) without touching the filesystem.

## Solution

An optional `dryRun` flag on the tool's JSON input. When true, the tool runs the
existing parse, prepare, and preview pipeline and returns the dry-run preview
(or the existing failure output on invalid patches) without writing any file.
Grammar-route calls are unchanged and always apply. The flag defaults to false,
so existing callers see no behavior change.

## User Stories

1. As a model caller on a JSON-route provider, I want to preview a risky patch
before applying it, so that I can catch validation errors without side effects.
2. As a model caller, I want dry-run failures to look exactly like real-run
failures (same messages, same recovery instructions), so that I learn nothing
new and my retry logic is unchanged.
3. As a model caller, I want a successful dry run to return the same rendered
preview I would see after a real apply, so that I can confirm the diff before
committing to it.
4. As a grammar-route caller, I want my calls to keep applying unconditionally,
so that the Codex grammar stays stable and I need no migration.
5. As an existing JSON caller who never sends `dryRun`, I want identical
behavior to today, so that nothing I rely on breaks.
6. As a contributor, I want the tool description to document `dryRun`, so that
models discover the capability through the existing description channel.
7. As a contributor, I want dry-run coverage for every operation kind
(add, update, delete, move), so that no operation silently bypasses preview.

## Implementation Decisions

- Add an optional boolean `dryRun` (default false) to the JSON input schema
alongside `input`. Optional-only: the Codex patch grammar and all existing
schema fields stay unchanged per the stability constraint.
- Normalize the flag in the existing argument-normalization seam: coerce
non-boolean values to false, treat a missing flag as false, and keep string
(grammar) calls applying unconditionally.
- In the tool's execute path, after parsing and preparing operations and
building the preview, branch: when `dryRun` is true, return the preview result
without invoking the write phase. Reuse the existing failure return path
verbatim for invalid patches (same failure lines, same recovery instructions,
with empty applied files and no actions applied).
- Title the dry-run result distinctly (e.g. "Dry-run preview", not "Applied
patch") so callers and the TUI render path cannot mistake a preview for an
applied change.
- Document the flag with one to two lines in the tool description, showing the
JSON call shape with `"dryRun": true`.
- Vocabulary follows the project glossary: the new term is Dry-run preview
(see CONTEXT.md), and the JSON-only transport choice is recorded in
docs/adr/0008-json-only-dry-run-preview.md.

## Testing Decisions

- Test external behavior only, through the public seams: the exported detailed
apply function (or the tool's execute path) and the schema normalization.
Assert outcomes (files unchanged, preview returned, failure text), never
internals.
- Cases: dry-run add/update/delete/move each leave the filesystem untouched and
return the same preview a real apply would render; dry-run with an invalid
patch (bad syntax, disallowed path, context mismatch) returns the identical
failure output as a real run with zero files written; omitted `dryRun` and
`dryRun: false` behave exactly like today (files written); grammar/string calls
ignore the concept entirely and apply.
- Prior art: the existing filesystem-behavior and transport test files, which
already drive the public apply seam with fixture patches and assert
file outcomes.
- Required repo checks on the final revision: `npm run check`, `npm test`,
`npm pack --dry-run`. Live Pi verification per CONTRIBUTION.md (tool behavior
change): CRUD matrix with two models from different provider families, one
grammar route and one JSON route, recording revision, versions, model IDs, and
any errors or recoveries.

## Out of Scope

- Grammar-route dry-run (no syntax channel for extra parameters; would break
the Codex grammar stability constraint).
- A separate preview tool (rejected in grilling; one tool, one flag).
- Pre-flight filesystem guarantees (permission / race checks beyond current
validation); a dry-run pass reports validation only, never a promise that a
later real run will succeed.
- Rollback of partially applied patches; dry-run avoids writes rather than
undoing them.
- New error types or new preview formats; both are reused verbatim.

## Further Notes

- Commit title for release: `feat: add dry-run preview mode` (minor bump).
The new README content ships in the same tarball, which also refreshes the
pi.dev listing.
- This spec lives at .scratch/dry-run-preview/spec.md (degraded mode: no
issue tracker configured in this repo).
