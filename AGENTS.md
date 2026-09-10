# Repository Conventions

Conventions for human contributors and AI agents working on this repository.

## Contribution workflow

- Read `CONTRIBUTION.md` before editing or opening a PR. Follow its change-to-test matrix and read `docs/live-testing.md` for live verification.
- Run `npm run check`, `npm test`, and `npm pack --dry-run` on the final revision, plus applicable live tests, before creating a ready PR. Fill `.github/pull_request_template.md` with actual results.
- Report exact provider/model IDs, Pi/Node versions, OS, tested revision, errors/recoveries, and missing coverage. Never infer live success from plan mode, mocks, unit tests, or assistant prose.
- Live tests are developer-run. Do not add automatic model calls to PR CI, schedules, or releases as a routine test change. Use only the model scope and costs authorized by the user; one canary does not authorize a larger matrix.
- If required access or authorization is missing, finish local checks and keep any PR as draft until verification is completed or a maintainer explicitly records a waiver. Never tick unrun checks or hide failures.
- Use Conventional Commit PR titles. Do not bump versions per PR or require new entries in the historical `CHANGELOG.md`; document behavior in the PR and relevant docs.

## Style

- Terse technical prose. No emojis in commits, issues, PR comments, or code.
- TypeScript strict mode. No `any`, no `unknown` casts where avoidable, no `@ts-ignore`, no `@ts-expect-error`, no enums.
- ESM modules with `.js` suffix in import paths (Node16 resolution).
- Tabs for indentation. Double quotes for strings (matches biome config).
- Tests use vitest with `#given .. #when .. #then` description style or plain `// given / // when / // then` body comments.

## Commands

- `npm install` — install dependencies.
- `npm test` — run vitest once.
- `npm run typecheck` — strict TypeScript check.
- `npm run check` — type check + biome.
- `pi -e ./src/index.ts` — load the extension into a local pi session for manual smoke testing.
- `npm run test:pi -- --model provider/model-id` — preview the live-test plan without API calls. Add `--live` to run an authorized model matrix.

## Constraints

- No Bun APIs. Runtime is Node only.
- This extension registers `apply_patch` for every model, replacing native edit/write tools. Target Pi >=0.85.1 and use capability-based constrainedSampling with JSON fallback.
- Keep the Codex patch grammar and JSON input schema stable. The tool description intentionally supports both grammar and JSON calls.
- No dependency on pi-coding-agent internal modules outside the documented public extension API in `@earendil-works/pi-coding-agent`.

## Don'ts

- No `git add -A` or `git add .`. Stage only the files you changed.
- No `git commit --no-verify`. No force pushes. No history rewriting on shared branches.
