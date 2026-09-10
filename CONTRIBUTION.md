# Contributing

Read this guide and [AGENTS.md](AGENTS.md) before editing or opening a PR. Read [live testing](docs/live-testing.md) for extension changes and [releasing](docs/releasing.md) for release automation.

## Before opening a PR

Use Node.js 22.14 or newer. Install locked dependencies and run these commands on the final revision:

```sh
npm ci
npm run check
npm test
npm pack --dry-run
```

Fix failures before marking a PR ready. State your local OS; CI verifies Ubuntu, macOS, and Windows. Follow `.gitattributes` for LF line endings. Preserve the stable patch grammar, JSON schema, activation for every model, workspace confinement, symlink rejection, existing-target protection, and overlapping-path rejection. Add regression tests for behavior fixes.

## Required additional testing

| Change | Verification before a ready PR |
| --- | --- |
| Patch engine, description, activation, schema, or argument handling | Live Pi CRUD with at least two models from different provider families, including a non-GPT model. |
| Grammar/JSON transport or capabilities | One grammar-capable route and one JSON function-tool route. Report transport evidence; a model name alone is not evidence. |
| Provider-specific fix | The affected provider/model and a second provider for regression coverage. |
| Filesystem/path safety | Relevant deterministic safety tests, live CRUD, and CI on all OSes; identify the affected platform. |
| Live-test runner | Runner unit tests, plan mode, and at least one real Pi model. |
| Documentation or CI only | Standard checks; explain why live tests are N/A. Validate workflow syntax when changed. |

Apply all relevant rows. Live tests are run by developers, not automatically by PR CI, schedules, or releases. Select models available to your account; a model's name does not prove it is free.

If credentials, quota, or platform access prevent required tests, open a **draft PR** with the exact missing coverage. Never mark an unrun check as passed. Complete the tests or obtain an explicit, recorded maintainer waiver before marking the PR ready.

## Live Pi testing and evidence

Follow [provider setup and smoke-test instructions](docs/live-testing.md). Preview the matrix, then run it with your own credentials:

```sh
npm run test:pi -- --model 'provider/exact-model-id' --model 'other-provider/exact-model-id'
npm run test:pi -- --model 'provider/exact-model-id' --model 'other-provider/exact-model-id' --live
```

Each model must pass create, read/update, direct move, read, and delete. Inspect `pi-smoke-report.json` and disclose tool errors/recoveries even when the final result passes. Plan mode, mocked transport tests, and assistant success messages are not live evidence. A successful smoke run establishes compatibility for the tested configuration at that time, not every model.

Record the tested revision, Node/Pi versions, OS, exact provider/model IDs, scenario results, and limitations in the PR template. Attach a sanitized report or concise results. Do not attach API keys, auth files, private gateway URLs, or unreviewed logs. Cost estimates of zero may mean pricing was not configured, not that the run was free.

## PRs and releases

Use a Conventional Commit title: `fix: reject Windows symlink paths`, `feat: add a patch operation`, or `docs: explain provider setup`. Describe the resulting behavior and testing in the PR template. For breaking changes, document migration and use `!` or a `BREAKING CHANGE:` footer.

Squash merge using the PR title. semantic-release determines versions after validation on main; do not bump versions per PR. New release notes are generated in GitHub Releases; `CHANGELOG.md` retains historical entries.

Wait for required CI checks before merging. Do not disable tests, loosen safety assertions, or retry repeatedly just to get green checks; investigate and disclose flaky behavior.
