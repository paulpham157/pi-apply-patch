import { access } from "node:fs/promises";
import { expect, it } from "vitest";
import { resolvePiCli, stages, validateTrace } from "../scripts/pi-live-smoke.mjs";

function trace(input = "*** Add File: patch-smoke-test.txt", isError = false) {
	return [
		{
			type: "message_end",
			message: { role: "assistant", provider: "example", model: "model", stopReason: "toolUse" },
		},
		{ type: "tool_execution_start", toolCallId: "patch", toolName: "apply_patch", args: { input } },
		{ type: "tool_execution_end", toolCallId: "patch", toolName: "apply_patch", isError },
		{ type: "tool_execution_start", toolCallId: "read", toolName: "read", args: { path: "patch-smoke-test.txt" } },
		{ type: "tool_execution_end", toolCallId: "read", toolName: "read", isError: false },
		{ type: "agent_end" },
	];
}

function dryRunTrace() {
	return [
		{
			type: "message_end",
			message: { role: "assistant", provider: "example", model: "model", stopReason: "toolUse" },
		},
		{
			type: "tool_execution_start",
			toolCallId: "read-before",
			toolName: "read",
			args: { path: "patch-smoke-test.txt" },
		},
		{ type: "tool_execution_end", toolCallId: "read-before", toolName: "read", isError: false },
		{
			type: "tool_execution_start",
			toolCallId: "patch",
			toolName: "apply_patch",
			args: { input: `*** Update File: patch-smoke-test.txt`, dryRun: true },
		},
		{ type: "tool_execution_end", toolCallId: "patch", toolName: "apply_patch", isError: false },
		{
			type: "tool_execution_start",
			toolCallId: "read-after",
			toolName: "read",
			args: { path: "patch-smoke-test.txt" },
		},
		{ type: "tool_execution_end", toolCallId: "read-after", toolName: "read", isError: false },
		{ type: "agent_end" },
	];
}

it("#given successful patch and read #when validating #then accepts tool evidence", () => {
	expect(validateTrace(trace(), stages[0], "example", "model").toolCalls).toBe(2);
});
it("#given dry-run stage #when validating #then requires a dryRun call and no real writes", () => {
	const dryStage = stages.find((stage) => stage.name === "dry-run");
	expect(dryStage).toBeDefined();
	expect(dryStage.files).toEqual({ "patch-smoke-test.txt": "hello patch\n" });
	expect(validateTrace(dryRunTrace(), dryStage, "example", "model").toolCalls).toBe(3);
	expect(() => validateTrace(trace(`*** Update File: patch-smoke-test.txt`), dryStage, "example", "model")).toThrow(
		"No successful dry-run",
	);
	const mixed = dryRunTrace();
	mixed.splice(2, 0, {
		type: "tool_execution_start",
		toolCallId: "real",
		toolName: "apply_patch",
		args: { input: "*** Update File: patch-smoke-test.txt" },
	});
	mixed.splice(3, 0, { type: "tool_execution_end", toolCallId: "real", toolName: "apply_patch", isError: false });
	expect(() => validateTrace(mixed, dryStage, "example", "model")).toThrow("non-dry-run");
});
it("#given failed patch #when validating #then rejects assistant-only claims", () => {
	expect(() => validateTrace(trace(undefined, true), stages[0], "example", "model")).toThrow(
		"No successful apply_patch",
	);
});
it("#given model fallback #when validating #then fails", () => {
	expect(() => validateTrace(trace(), stages[0], "example", "different-model")).toThrow("Model fallback");
});
it("#given missing read #when validating #then fails", () => {
	expect(() =>
		validateTrace(
			trace().filter((e) => e.toolCallId !== "read"),
			stages[0],
			"example",
			"model",
		),
	).toThrow("No successful read");
});
it("#given native edit #when validating #then fails", () => {
	const events = trace();
	events[1].toolName = "edit";
	expect(() => validateTrace(events, stages[0], "example", "model")).toThrow("Unexpected tool");
});
it("#given incomplete stream #when validating #then fails", () => {
	expect(() => validateTrace(trace().slice(0, -1), stages[0], "example", "model")).toThrow("Agent did not complete");
});
it("#given the installed ESM-only Pi package #when resolving its CLI #then finds an executable entry", async () => {
	await expect(access(resolvePiCli())).resolves.toBeUndefined();
});
