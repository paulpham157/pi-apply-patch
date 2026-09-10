# Automatic releases

`publish.yml` runs on pushes to `main` and manual dispatches on `main`. It validates the exact commit on Ubuntu, macOS, and Windows before running semantic-release on Ubuntu with Node 24. All three CI jobs must pass. Direct pushes to main also trigger this process; use branch protection to require PRs.

## Commit and merge convention

Use squash merge with the PR title as the squash commit title. Make the `PR title / title` check and all three CI checks required in branch protection. Configure GitHub's squash commit default to **Pull request title**, and disable merge/rebase merging if every merged PR must follow this convention. The title check cannot enforce repository merge settings or prevent editing the final squash message.

| Title | Release |
| --- | --- |
| `fix: handle Windows paths` | Patch |
| `perf: reduce patch parsing overhead` | Patch |
| `feat: add a patch operation` | Minor |
| `feat!: change the input contract` | Major |
| `docs: explain installation` | None |
| `ci: add Windows tests` | None |

A `BREAKING CHANGE:` footer also triggers a major release. Breaking changes follow normal SemVer even while the package is at `0.x`: a major change can release `1.0.0`. The highest release type among commits since the last release wins. Do not manually bump the version for each PR.

## One-time npm setup

Configure a GitHub Actions Trusted Publisher in the npm settings for `@paulpham157/apply-patch`:

| Field | Value |
| --- | --- |
| Organization or user | `paulpham157` |
| Repository | `pi-apply-patch` |
| Workflow filename | `publish.yml` |
| Environment | Leave blank |
| Allowed action | Enable direct `npm publish` |

The workflow uses OIDC with `id-token: write`; no npm token or interactive OTP is needed. GitHub's built-in token creates tags and releases through `contents: write`. Tag rules must allow these releases. Issue/PR comments and labels are disabled.

## Version history and artifacts

The scoped package was published manually before this CI migration: [`@paulpham157/apply-patch@0.1.3`](https://www.npmjs.com/package/@paulpham157/apply-patch/v/0.1.3). Verify it with `npm view @paulpham157/apply-patch@0.1.3 name version gitHead`. A `ci:` squash commit for this migration intentionally does not republish that existing version; installation already works. Subsequent `fix:` or `feat:` commits trigger new releases.

The already published npm version `0.1.3` reports gitHead `74d55c8036927e5da578a86f3ca31338baa43680`. The workflow establishes a local `v0.1.3` baseline tag at that commit if absent and rejects a conflicting tag. This prevents semantic-release from treating the package as an unversioned first release. Its next release pushes the baseline with the release tags.

semantic-release updates package metadata in the publishing workspace, publishes npm, and creates a GitHub Release with generated notes. It does not commit version bumps or changelog updates to main. `package.json` on main remains a development baseline; npm has the released version. `CHANGELOG.md` retains historical entries; new release notes live in GitHub Releases.

Only one release workflow runs at a time. GitHub may replace a pending run with a newer one; semantic-release includes all unreleased commits, so it does not require a separate run or version for every PR. An outdated run may skip publication if main has advanced; the newer run handles those changes after its own CI passes.

## Failure recovery and verification

For failures before publication, fix the cause and dispatch `publish` on main. If npm publication succeeded but GitHub Release creation failed, inspect npm and Git tags before recovery: rerunning semantic-release does not guarantee it repairs every partially completed release. Never delete a published version's tag to force a retry.

Local checks cover extension tests and commit classification. OIDC authentication and actual publishing require the first GitHub Actions run after setup. Do not treat a local check as proof of publishing permissions.

References: [semantic-release GitHub Actions](https://semantic-release.org/recipes/ci-configurations/github-actions/), [commit conventions](https://semantic-release.org/intro/), [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).
