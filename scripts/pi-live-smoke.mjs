import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = "patch-smoke-test.txt";
const moved = "patch-smoke-test-moved.txt";
const rules =
	"Use separate tool calls. Read existing files before changing them. Use apply_patch for every mutation, never bash/edit/write. If a patch fails, read again and regenerate it. Only operate on patch-smoke-test.txt and patch-smoke-test-moved.txt.";
export const stages = [
	{
		name: "create",
		header: `*** Add File: ${source}`,
		prompt: `Create ${source} containing exactly hello patch followed by a newline, then read it.`,
		files: { [source]: "hello patch\n" },
	},
	{
		name: "update",
		header: `*** Update File: ${source}`,
		prompt: `Read ${source}, change its content to hello universal patch followed by a newline, then read it again.`,
		files: { [source]: "hello universal patch\n" },
	},
	{
		name: "move",
		header: `*** Move to: ${moved}`,
		prompt: `Read ${source}, then move it directly to ${moved} using Update File + Move to, not Add + Delete. Stop if destination exists. Read the new file.`,
		files: { [moved]: "hello universal patch\n" },
	},
	{ name: "delete", header: `*** Delete File: ${moved}`, prompt: `Read ${moved}, then delete it.`, files: {} },
];

export function validateTrace(events, stage, provider, model) {
	const messages = events
		.filter((e) => e.type === "message_end" && e.message?.role === "assistant")
		.map((e) => e.message);
	assert.ok(messages.length, "No assistant messages received");
	for (const message of messages) {
		assert.equal(message.provider, provider, "Provider fallback detected");
		assert.equal(message.model, model, "Model fallback detected");
		assert.ok(!["error", "aborted"].includes(message.stopReason), `Model stopped: ${message.stopReason}`);
	}
	assert.ok(
		events.some((e) => e.type === "agent_end"),
		"Agent did not complete",
	);
	const calls = events.filter((e) => e.type === "tool_execution_start");
	assert.ok(
		calls.every((e) => ["read", "apply_patch"].includes(e.toolName)),
		"Unexpected tool used",
	);
	const ends = new Map(events.filter((e) => e.type === "tool_execution_end").map((e) => [e.toolCallId, e]));
	const succeeded = (call) => ends.has(call.toolCallId) && ends.get(call.toolCallId).isError === false;
	const patch = calls.find((call) => {
		const input = typeof call.args === "string" ? call.args : call.args?.input;
		return (
			call.toolName === "apply_patch" && typeof input === "string" && input.includes(stage.header) && succeeded(call)
		);
	});
	assert.ok(patch, `No successful apply_patch for ${stage.name}`);
	const reads = calls.filter((call) => call.toolName === "read" && succeeded(call));
	assert.ok(reads.length, "No successful read");
	if (stage.name !== "create")
		assert.ok(
			reads.some((r) => calls.indexOf(r) < calls.indexOf(patch)),
			"Missing read before mutation",
		);
	if (stage.name !== "delete")
		assert.ok(
			reads.some((r) => calls.indexOf(r) > calls.indexOf(patch)),
			"Missing read after mutation",
		);
	if (stage.name === "move") {
		for (const call of calls.filter((e) => e.toolName === "apply_patch")) {
			const input = typeof call.args === "string" ? call.args : call.args?.input;
			assert.ok(
				typeof input === "string" && !/\*\*\* (Add|Delete) File:/.test(input),
				"Move substituted with Add/Delete",
			);
		}
	}
	return {
		toolCalls: calls.length,
		toolErrors: [...ends.values()].filter((e) => e.isError).length,
		cost: messages.reduce((sum, m) => sum + (m.usage?.cost?.total ?? 0), 0),
	};
}

export function resolvePiCli() {
	const entry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
	return path.join(path.dirname(entry), "bundle/cli.js");
}

function runPi(cli, args, cwd, timeout) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let failure;
		const timer = setTimeout(() => {
			failure = new Error("Pi timed out");
			child.kill("SIGKILL");
		}, timeout);
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
			if (stdout.length > 8_000_000) {
				failure = new Error("Pi output exceeded 8 MB");
				child.kill("SIGKILL");
			}
		});
		child.stderr.on("data", (chunk) => {
			stderr = (stderr + chunk).slice(-2000);
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (failure) return reject(failure);
			if (code !== 0) return reject(new Error(`Pi exited ${code}: ${stderr}`));
			try {
				resolve(
					stdout
						.split(/\r?\n/)
						.filter((s) => s.trim())
						.map((s) => JSON.parse(s)),
				);
			} catch {
				reject(new Error("Pi output is not valid JSONL"));
			}
		});
	});
}

async function main() {
	const args = process.argv.slice(2);
	const live = args.includes("--live");
	const models = [];
	let report = path.resolve("pi-smoke-report.json");
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--live") continue;
		if (args[i] === "--model" && args[i + 1]) {
			models.push(args[++i]);
			continue;
		}
		if (args[i] === "--report" && args[i + 1]) {
			report = path.resolve(args[++i]);
			continue;
		}
		throw new Error(`Unexpected argument: ${args[i]}`);
	}
	assert.ok(
		models.length,
		"Usage: npm run test:pi -- --model provider/exact-model-id [--model provider/id] [--live] [--report path]",
	);
	for (const entry of models) assert.match(entry, /^[^/\s]+\/[^\s]+$/, "Use provider/exact-model-id");
	console.log(`${live ? "LIVE" : "PLAN"}: ${models.join(", ")}; 4 prompts/model; 120s timeout/prompt; sequential.`);
	if (!live) {
		console.log("No API calls. Add --live to use your configured Pi credentials (provider charges may apply).");
		return;
	}
	await import("node:fs/promises").then(({ mkdir }) => mkdir(path.dirname(report), { recursive: true }));
	const cli = resolvePiCli();
	const results = [];
	for (const entry of models) {
		const slash = entry.indexOf("/");
		const provider = entry.slice(0, slash);
		const model = entry.slice(slash + 1);
		const cwd = await mkdtemp(path.join(tmpdir(), "pi-patch-live-"));
		const result = { model: entry, stages: [], passed: false };
		try {
			for (const stage of stages) {
				console.log(`${entry}: ${stage.name}`);
				const events = await runPi(
					cli,
					[
						"--mode",
						"json",
						"--no-session",
						"--no-extensions",
						"--no-skills",
						"--no-prompt-templates",
						"--no-themes",
						"--no-context-files",
						"--tools",
						"read,edit,write",
						"-e",
						path.join(root, "src/index.ts"),
						"--provider",
						provider,
						"--model",
						model,
						`${rules}\n${stage.prompt}`,
					],
					cwd,
					120_000,
				);
				const stats = validateTrace(events, stage, provider, model);
				assert.deepEqual(
					(await readdir(cwd)).sort(),
					Object.keys(stage.files).sort(),
					"Unexpected workspace files",
				);
				for (const [file, expected] of Object.entries(stage.files))
					assert.equal(await readFile(path.join(cwd, file), "utf8"), expected);
				result.stages.push({ name: stage.name, ...stats });
			}
			result.passed = true;
		} catch (error) {
			result.error = error instanceof Error ? error.message : String(error);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
		results.push(result);
		console.log(`${entry}: ${result.passed ? "PASS" : `FAIL: ${result.error}`}`);
		await writeFile(report, `${JSON.stringify({ results }, null, 2)}\n`);
	}
	if (results.some((r) => !r.passed)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
