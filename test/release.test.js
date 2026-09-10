import { readFileSync } from "node:fs";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";
import { expect, it } from "vitest";

const config = JSON.parse(readFileSync(new URL("../.releaserc.json", import.meta.url), "utf8"));
const logger = { log() {} };

it.each([
	["fix: handle Windows paths", "patch"],
	["perf: reduce allocations", "patch"],
	["feat: add an operation", "minor"],
	["feat!: change input", "major"],
	["fix: change input\n\nBREAKING CHANGE: remove old input", "major"],
	["docs: clarify setup", null],
	["ci: add Windows", null],
])("#given commit %s #when analyzed #then selects %s", async (message, expected) => {
	const result = await analyzeCommits(config.plugins[0][1], {
		cwd: process.cwd(),
		commits: [{ message, hash: "1234567" }],
		logger,
	});
	expect(result).toBe(expected);
});

it("#given the configured preset #when generating notes #then renders the fix", async () => {
	const notes = await generateNotes(config.plugins[1][1], {
		cwd: process.cwd(),
		commits: [{ message: "fix: handle Windows paths", hash: "1234567" }],
		lastRelease: { gitTag: "v0.1.3" },
		nextRelease: { gitTag: "v0.1.4", version: "0.1.4" },
		options: { repositoryUrl: "https://github.com/paulpham157/pi-apply-patch" },
		logger,
	});
	expect(notes).toContain("handle Windows paths");
});
