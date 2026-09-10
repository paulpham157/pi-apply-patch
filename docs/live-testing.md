# Live Pi model smoke tests

This opt-in harness launches the installed Pi CLI and the repository's `src/index.ts`. It uses real provider calls, not mocked serializers. Default unit tests and GitHub CI never invoke it.

Developers run these tests before a PR according to [CONTRIBUTION.md](../CONTRIBUTION.md). Record the actual model results in the PR template; missing required coverage belongs in a draft PR.

## Provider configuration

For built-in providers, use Pi's `/login` or the documented environment variable, for example `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, or `OPENCODE_API_KEY`. Export credentials in the same terminal that runs the test. Do not commit them.

For a custom OpenAI-compatible gateway, merge a provider into `~/.pi/agent/models.json` (preserve existing entries):

```json
{
  "providers": {
    "my-gateway": {
      "baseUrl": "https://gateway.example.com/v1",
      "api": "openai-completions",
      "apiKey": "$MY_GATEWAY_API_KEY",
      "models": [{ "id": "exact-upstream-model-id" }]
    }
  }
}
```

Replace the URL and model ID with values supported by your gateway. `api` must match its protocol: `openai-completions`, `openai-responses`, `anthropic-messages`, or `google-generative-ai`. The API protocol depends on the endpoint, not the model family. `$MY_GATEWAY_API_KEY` references an environment variable; omit real secrets from the JSON. Set context/output limits and capability compatibility fields according to the actual endpoint.

Check configuration with `pi --list-models` and `pi auth check --provider my-gateway --model exact-upstream-model-id --json`. Auth readiness is not proof of a successful model call. Test it with `--model my-gateway/exact-upstream-model-id --live` using the runner below.

## Run the scenarios

First authenticate the desired providers in Pi and obtain exact provider/model IDs from `pi --list-models`. Custom providers must already be configured in Pi's models configuration; provider extensions are not auto-loaded by this harness.

Preview a matrix without calling any model:

```sh
npm run test:pi -- --model 'provider/exact-model-id' --model 'another-provider/exact-model-id'
```

Run that matrix by adding `--live`:

```sh
npm run test:pi -- --model 'provider/exact-model-id' --live
```

For the previously tested OpenCode model:

```sh
npm run test:pi -- --model 'opencode/muse-spark-1.3-contributor-free' --live
```

Repeat `--model` to cover GPT, Claude, Gemini, DeepSeek, Kimi, GLM, or Qwen available to your account. Use exact IDs from `pi --list-models`; other provider display names may differ from their IDs.

Each model runs sequentially through four fresh Pi sessions sharing a temporary workspace:

1. Create `patch-smoke-test.txt` and read it.
2. Read, update to `hello universal patch`, and read again.
3. Read, directly move using `Update File` + `Move to`, and read the destination.
4. Read and delete the destination.

The runner checks successful `apply_patch` and `read` events, ordering, actual model identity, exact file contents, source removal, and final cleanup. Native edit/write calls fail validation; bash is not exposed. Malformed patches may recover, and tool-error counts are reported. Move via Add/Delete fails. Filesystem assertions are made after each session rather than trusting assistant prose.

Each prompt has a 120-second timeout. Four prompts can involve more than four provider requests because of tool loops/retries. Timeout is not a spending cap; use provider-side spending controls. No model API call was made merely by installing or running the default tests.

Results go to `pi-smoke-report.json` (override with `--report path`); a failed model produces exit code 1. Each model's temporary workspace is removed even on failure. Reports contain per-stage tool counts/errors and provider-reported cost estimates, not raw transcripts or credentials. Failed stages may have incurred costs not included in completed-stage totals. Do not publish reports without checking error text.

This is a guided CRUD smoke test, not a benchmark of autonomous tool choice or proof of grammar versus JSON transport. Existing deterministic workspace and transport tests cover those lower-level contracts. Pi uses your normal global auth/model settings, while extension, skill, context-file, theme, and prompt-template discovery are disabled. A temporary cwd is not an OS sandbox.
