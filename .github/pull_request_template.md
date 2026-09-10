## Summary

<!-- Describe the problem and resulting behavior. Use a Conventional Commit title. -->

## Before opening this PR

- [ ] I read CONTRIBUTION.md and AGENTS.md in this repository.
- [ ] I selected the required tests from CONTRIBUTION.md and read docs/live-testing.md when applicable.
- [ ] I tested the final revision, or kept this PR as draft and documented the missing checks below.

## Verification

- [ ] `npm run check` (typecheck + biome)
- [ ] `npm test` (unit tests)
- [ ] `npm pack --dry-run` (release sanity)

Tested revision:
Node / Pi versions:
Local OS:

## Live Pi results

<!-- Apply CONTRIBUTION.md's testing matrix. For docs/CI-only changes, write N/A with a reason.
Do not mark unrun tests as passed or infer live results from mocks.
Include sanitized evidence; never paste credentials, auth files, or private endpoint URLs. -->

| Exact provider/model | Create | Read/update | Direct move | Read/delete | Errors/recoveries |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Report or evidence:
Transport evidence if applicable (grammar / JSON / unverified):
Failures, missing coverage, or N/A reason:

## apply_patch impact

- [ ] Tool schema / grammar changes are documented in README if changed
- [ ] Workspace path safety remains covered by tests
- [ ] User-visible changes, provider limitations, and breaking-change migration are documented where applicable; otherwise explained above.

<!-- Required tests must pass, or a maintainer must explicitly record a waiver, before marking this PR ready. -->
