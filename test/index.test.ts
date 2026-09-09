import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	APPLY_PATCH_DESCRIPTION,
	APPLY_PATCH_LARK_GRAMMAR,
	type ApplyPatchExtensionAPI,
	applyPatch,
	applyPatchDetailed,
	createApplyPatchTool,
	extractPatchedPaths,
	PatchParseError,
	registerApplyPatchExtension,
	truncatePreview,
} from "../src/index.js";
import { writeFileAtomic } from "../src/write-file-atomic.js";

const tempDirectories: string[] = [];
const identityTheme = {
	fg: (_name: string, text: string) => text,
	bg: (_name: string, text: string) => text,
	bold: (text: string) => text,
	inverse: (text: string) => text,
};
type ApplyPatchTool = ReturnType<typeof createApplyPatchTool>;
type ApplyPatchUpdate = Parameters<NonNullable<Parameters<ApplyPatchTool["execute"]>[3]>>[0];
type ToolsetModel = { provider: string; id: string; api?: string };
type ToolsetHandler = (
	event: { model?: ToolsetModel },
	ctx: { model: ToolsetModel | undefined },
) => void | Promise<void>;

function isToolsetHandler(value: unknown): value is ToolsetHandler {
	return typeof value === "function";
}

function createToolsetTestApi(initialActiveTools: string[]): {
	api: ApplyPatchExtensionAPI;
	trigger: (eventName: string, model: ToolsetModel | undefined) => Promise<void>;
	setActiveTools: (toolNames: string[]) => void;
	getActiveTools: () => string[];
	getSetActiveToolsCalls: () => string[][];
} {
	let activeTools = [...initialActiveTools];
	const setActiveToolsCalls: string[][] = [];
	const handlers = new Map<string, ToolsetHandler[]>();
	const api: ApplyPatchExtensionAPI = {
		registerTool() {},
		on(...args: unknown[]) {
			const eventName = args[0];
			const handler = args[1];
			if (typeof eventName !== "string" || !isToolsetHandler(handler)) {
				return;
			}
			handlers.set(eventName, [...(handlers.get(eventName) ?? []), handler]);
		},
		getActiveTools() {
			return [...activeTools];
		},
		setActiveTools(toolNames: string[]) {
			activeTools = [...toolNames];
			setActiveToolsCalls.push([...toolNames]);
		},
	};

	return {
		api,
		async trigger(eventName, model) {
			const event = model !== undefined ? { model } : {};
			for (const handler of handlers.get(eventName) ?? []) {
				await handler(event, { model });
			}
		},
		setActiveTools(toolNames) {
			activeTools = [...toolNames];
		},
		getActiveTools() {
			return [...activeTools];
		},
		getSetActiveToolsCalls() {
			return setActiveToolsCalls.map((toolNames) => [...toolNames]);
		},
	};
}

async function createTempDirectory(): Promise<string> {
	const directory = await mkdtemp(path.join(process.cwd(), "test-temp-"));
	tempDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	while (tempDirectories.length > 0) {
		const directory = tempDirectories.pop();
		if (directory) {
			await rm(directory, { recursive: true, force: true });
		}
	}
});

describe("pi-apply-patch", () => {
	it("#given extension #when registered #then exposes hybrid apply_patch tool", () => {
		// given
		let capturedToolName: string | undefined;
		let capturedDescription: string | undefined;
		let capturedSampling: ApplyPatchTool["constrainedSampling"];
		const extensionApi = {
			registerTool(tool: ReturnType<typeof createApplyPatchTool>) {
				capturedToolName = tool.name;
				capturedDescription = tool.description;
				capturedSampling = tool.constrainedSampling;
			},
			on() {},
			getActiveTools() {
				return ["read", "write", "edit"];
			},
			setActiveTools() {},
		} satisfies ApplyPatchExtensionAPI;

		// when
		registerApplyPatchExtension(extensionApi);

		// then
		expect(capturedToolName).toBe("apply_patch");
		expect(capturedDescription).toBe(APPLY_PATCH_DESCRIPTION);
		expect(capturedSampling).toEqual({
			type: "grammar",
			variants: { openai_lark: APPLY_PATCH_LARK_GRAMMAR },
		});
	});

	it("#given active patch model after reload with apply_patch already active #when session starts #then keeps apply_patch active", async () => {
		// given
		const harness = createToolsetTestApi(["read", "bash", "apply_patch"]);
		registerApplyPatchExtension(harness.api);

		// when
		await harness.trigger("session_start", { provider: "openai", id: "gpt-5" });

		// then
		expect(harness.getActiveTools()).toEqual(["read", "bash", "apply_patch"]);
		expect(harness.getSetActiveToolsCalls()).toEqual([["read", "bash", "apply_patch"]]);
	});

	it("#given active patch model with stale edit tools #when session starts #then normalizes to apply_patch only", async () => {
		// given
		const harness = createToolsetTestApi(["read", "apply_patch", "edit", "write"]);
		registerApplyPatchExtension(harness.api);

		// when
		await harness.trigger("session_start", { provider: "openai", id: "gpt-5" });

		// then
		expect(harness.getActiveTools()).toEqual(["read", "apply_patch"]);
	});

	it("#given custom Responses provider with active patch model #when session starts #then enables apply_patch", async () => {
		// given
		const harness = createToolsetTestApi(["read", "edit", "write"]);
		registerApplyPatchExtension(harness.api);

		// when
		await harness.trigger("session_start", {
			provider: "my-proxy",
			id: "gpt-5",
			api: "openai-responses",
		});

		// then
		expect(harness.getActiveTools()).toEqual(["read", "apply_patch"]);
	});

	it("#given non active patch model and no original edit tools #when session starts #then keeps apply_patch active", async () => {
		// given
		const harness = createToolsetTestApi(["read", "apply_patch"]);
		registerApplyPatchExtension(harness.api);

		// when
		await harness.trigger("session_start", { provider: "anthropic", id: "claude-sonnet-4" });

		// then
		expect(harness.getActiveTools()).toEqual(["read", "apply_patch"]);
	});

	it("#given external tool change in active patch mode #when agent starts #then reconciles before model request", async () => {
		// given
		const harness = createToolsetTestApi(["read", "edit", "write"]);
		registerApplyPatchExtension(harness.api);
		await harness.trigger("session_start", { provider: "openai", id: "gpt-5" });
		harness.setActiveTools(["read", "write", "apply_patch", "edit"]);

		// when
		await harness.trigger("before_agent_start", { provider: "openai", id: "gpt-5" });

		// then
		expect(harness.getActiveTools()).toEqual(["read", "apply_patch"]);
	});

	it("#given active patch mode #when model switches to Claude #then apply_patch remains active", async () => {
		// given
		const harness = createToolsetTestApi(["read", "edit", "write"]);
		registerApplyPatchExtension(harness.api);
		await harness.trigger("session_start", { provider: "openai", id: "gpt-5" });

		// when
		await harness.trigger("model_select", { provider: "anthropic", id: "claude-sonnet-4" });

		// then
		expect(harness.getActiveTools()).toEqual(["read", "apply_patch"]);
	});

	it("#given raw codex patch #when executed #then applies file update", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "sample.txt"), "before\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: sample.txt
@@
-before
+after
*** End Patch`;

		// when
		await applyPatch(directory, patch);

		// then
		expect(await readFile(path.join(directory, "sample.txt"), "utf-8")).toBe("after\n");
	});

	it("#given parent traversal path #when applying patch #then rejects outside cwd", async () => {
		// given
		const directory = await createTempDirectory();
		const outsidePath = path.join(path.dirname(directory), `${path.basename(directory)}-outside.ts`);
		const relativeOutsidePath = path.relative(directory, outsidePath);
		tempDirectories.push(outsidePath);
		await writeFile(outsidePath, "outside\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: ${relativeOutsidePath}
@@
-outside
+changed
*** End Patch`;

		// when
		await expect(applyPatch(directory, patch)).rejects.toThrow("escapes workspace");

		// then
		expect(await readFile(outsidePath, "utf-8")).toBe("outside\n");
	});

	it("#given absolute path outside cwd #when applying patch #then rejects outside cwd", async () => {
		// given
		const directory = await createTempDirectory();
		const outsidePath = path.join(path.dirname(directory), `${path.basename(directory)}-absolute.ts`);
		tempDirectories.push(outsidePath);
		await writeFile(outsidePath, "outside\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: ${outsidePath}
@@
-outside
+changed
*** End Patch`;

		// when
		await expect(applyPatch(directory, patch)).rejects.toThrow("escapes workspace");

		// then
		expect(await readFile(outsidePath, "utf-8")).toBe("outside\n");
	});

	it("#given apply_patch tool execution #when started #then emits pending TUI diff update", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "sample.txt"), "before\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: sample.txt
@@
-before
+after
*** Add File: created.txt
+created
*** End Patch`;
		const tool = createApplyPatchTool();
		const updates: Array<{ text: string; update: ApplyPatchUpdate }> = [];

		// when
		await tool.execute(
			"apply-patch-test",
			{ input: patch },
			undefined,
			(update) => {
				const firstText = update.content.find((block) => block.type === "text")?.text;
				if (firstText) {
					updates.push({ text: firstText, update });
				}
			},
			{ cwd: directory } as never,
		);

		// then
		const update = updates[0];
		expect(update).toBeDefined();
		if (!update) {
			throw new Error("apply_patch did not emit a pending update");
		}
		expect(update.text).toContain("Applying patch (0/2)...\n• Edited 2 files (+2 -1)");
		expect(update.text).toContain("sample.txt (+1 -1)");
		expect(update.text).toContain("-1 before");
		expect(update.text).toContain("+1 after");
		expect(update.text).toContain("created.txt (+1 -0)");
		expect(update.text).toContain("+1 created");
		expect(update.text).not.toContain("Index:");

		const component = tool.renderResult?.(
			{ content: [{ type: "text", text: update.text }], details: update.update.details },
			{ expanded: false, isPartial: true },
			identityTheme as never,
			{ lastComponent: undefined } as never,
		);
		const rendered = component?.render(120).join("\n") ?? "";
		expect(rendered).toContain("Applying patch");
		expect(rendered).toContain("• Edited 2 files (+2 -1)");
		expect(rendered).toContain("sample.txt (+1 -1)");
		expect(rendered).toContain("+1 after");
		expect(rendered).not.toContain("Index:");
	});

	it("#given successful apply_patch tool execution #when rendered #then final result shows diff preview", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "sample.txt"), "before\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: sample.txt
@@
-before
+after
*** End Patch`;
		const tool = createApplyPatchTool();

		// when
		const result = await tool.execute("apply-patch-final-preview-test", { input: patch }, undefined, undefined, {
			cwd: directory,
		} as never);
		const component = tool.renderResult?.(
			result,
			{ expanded: true, isPartial: false },
			identityTheme as never,
			{ cwd: directory, toolCallId: "apply-patch-final-preview-test", args: { input: patch } } as never,
		);
		const rendered = component?.render(120).join("\n") ?? "";

		// then
		expect(result.details?.preview).toBeDefined();
		expect(rendered).toContain("Applied patch");
		expect(rendered).toContain("• Edited sample.txt (+1 -1)");
		expect(rendered).toContain("-1 before");
		expect(rendered).toContain("+1 after");
		expect(await readFile(path.join(directory, "sample.txt"), "utf-8")).toBe("after\n");
	});

	it("#given nested cwd #when previewing absolute workspace path #then formats relative to cwd", async () => {
		// given
		const directory = await createTempDirectory();
		const nestedDirectory = path.join(directory, "session");
		await mkdir(nestedDirectory);
		const absoluteFilePath = path.join(nestedDirectory, "sample.txt");
		await writeFile(absoluteFilePath, "before\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: ${absoluteFilePath}
@@
-before
+after
*** End Patch`;
		const updates: string[] = [];

		// when
		await createApplyPatchTool().execute(
			"apply-patch-cwd-preview-test",
			{ input: patch },
			undefined,
			(update) => {
				const text = update.content.find((block) => block.type === "text")?.text;
				if (text) {
					updates.push(text);
				}
			},
			{ cwd: nestedDirectory } as never,
		);

		// then
		expect(updates[0]).toContain("• Edited sample.txt (+1 -1)");
		expect(updates[0]).not.toContain(path.basename(directory));
		expect(await readFile(absoluteFilePath, "utf-8")).toBe("after\n");
	});

	it("#given large patch preview #when truncating #then keeps changed hunk visible", async () => {
		// given
		const directory = await createTempDirectory();
		const original = `${Array.from({ length: 40 }, (_, index) => `line-${index + 1}`).join("\n")}\n`;
		await writeFile(path.join(directory, "large.txt"), original, "utf-8");
		const patch = `*** Begin Patch
*** Update File: large.txt
@@
-line-30
+line-30 updated
*** End Patch`;
		const updates: string[] = [];

		// when
		await createApplyPatchTool().execute(
			"apply-patch-large-preview-test",
			{ input: patch },
			undefined,
			(update) => {
				const text = update.content.find((block) => block.type === "text")?.text;
				if (text) {
					updates.push(text);
				}
			},
			{ cwd: directory } as never,
		);

		// then
		expect(updates[0]).toContain("-30 line-30");
		expect(updates[0]).toContain("+30 line-30 updated");
		expect(updates[0]).not.toContain(" 1 line-1");
		expect(await readFile(path.join(directory, "large.txt"), "utf-8")).toContain("line-30 updated");
	});

	it("#given large generated diff #when truncating #then centers preview around first changed line", () => {
		// given
		const diff = [
			...Array.from({ length: 29 }, (_, index) => ` ${String(index + 1).padStart(2, " ")} line-${index + 1}`),
			"-30 line-30",
			"+30 line-30 updated",
			...Array.from({ length: 10 }, (_, index) => ` ${String(index + 31).padStart(2, " ")} line-${index + 31}`),
		].join("\n");

		// when
		const preview = truncatePreview(diff);

		// then
		expect(preview).toContain("-30 line-30");
		expect(preview).toContain("+30 line-30 updated");
		expect(preview).not.toContain(" 1 line-1");
		expect(preview).not.toContain(" 40 line-40");
	});

	it("#given multi file apply_patch tool execution #when applying #then emits realtime progress updates", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "first.txt"), "one\n", "utf-8");
		await writeFile(path.join(directory, "second.txt"), "two\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: first.txt
@@
-one
+ONE
*** Update File: second.txt
@@
-two
+TWO
*** End Patch`;
		const tool = createApplyPatchTool();
		const updates: ApplyPatchUpdate[] = [];

		// when
		await tool.execute(
			"apply-patch-progress-test",
			{ input: patch },
			undefined,
			(update) => {
				updates.push(update);
			},
			{ cwd: directory } as never,
		);

		// then
		expect(updates).toHaveLength(3);
		expect(updates[0]?.details?.progress).toEqual({ applied: 0, failed: 0, total: 2 });
		expect(updates[1]?.details?.progress).toEqual({ applied: 1, failed: 0, total: 2 });
		expect(updates[2]?.details?.progress).toEqual({ applied: 2, failed: 0, total: 2 });
		expect(updates[1]?.content.find((block) => block.type === "text")?.text).toContain("Applying patch (1/2)...");
		expect(updates[2]?.content.find((block) => block.type === "text")?.text).toContain("Applying patch (2/2)...");
		expect(await readFile(path.join(directory, "first.txt"), "utf-8")).toBe("ONE\n");
		expect(await readFile(path.join(directory, "second.txt"), "utf-8")).toBe("TWO\n");
	});

	it("#given progress callback throws #when applying detailed patch #then still applies all operations", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "first.txt"), "one\n", "utf-8");
		await writeFile(path.join(directory, "second.txt"), "two\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: first.txt
@@
-one
+ONE
*** Update File: second.txt
@@
-two
+TWO
*** End Patch`;

		// when
		const result = await applyPatchDetailed(directory, patch, () => {
			throw new Error("render failed");
		});

		// then
		expect(result.failures).toEqual([]);
		expect(result.appliedFiles).toEqual(["first.txt", "second.txt"]);
		expect(await readFile(path.join(directory, "first.txt"), "utf-8")).toBe("ONE\n");
		expect(await readFile(path.join(directory, "second.txt"), "utf-8")).toBe("TWO\n");
	});

	it("#given add targeting existing file #when executed #then preserves existing content", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "existing.txt"), "old\n", "utf-8");
		const patch = `*** Begin Patch
*** Add File: existing.txt
+new
*** End Patch`;
		const updates: string[] = [];

		// when
		await createApplyPatchTool().execute(
			"apply-patch-overwrite-test",
			{ input: patch },
			undefined,
			(update) => {
				const firstText = update.content.find((block) => block.type === "text")?.text;
				if (firstText) {
					updates.push(firstText);
				}
			},
			{ cwd: directory } as never,
		);

		// then
		expect(updates[0]).toContain("• Edited existing.txt (+1 -1)");
		expect(updates[0]).toContain("-1 old");
		expect(updates[0]).toContain("+1 new");
		expect(await readFile(path.join(directory, "existing.txt"), "utf-8")).toBe("old\n");
	});

	it("#given codex multi operation freeform patch #when executed #then applies all operations", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "modify.txt"), "line1\nline2\n", "utf-8");
		await writeFile(path.join(directory, "delete.txt"), "obsolete\n", "utf-8");
		const patch = `*** Begin Patch
*** Add File: nested/new.txt
+created
*** Delete File: delete.txt
*** Update File: modify.txt
@@
-line2
+changed
*** End Patch`;

		// when
		const summaries = await applyPatch(directory, patch);

		// then
		expect(summaries).toEqual(["add: nested/new.txt", "delete: delete.txt", "update: modify.txt"]);
		expect(await readFile(path.join(directory, "nested", "new.txt"), "utf-8")).toBe("created\n");
		expect(await readFile(path.join(directory, "modify.txt"), "utf-8")).toBe("line1\nchanged\n");
		await expect(readFile(path.join(directory, "delete.txt"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("#given codex patch with contextual chunks #when executed #then applies chunks in order", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "multi.txt"), "alpha\none\nbeta\ntwo\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: multi.txt
@@ alpha
-one
+ONE
@@ beta
-two
+TWO
*** End Patch`;

		// when
		await applyPatch(directory, patch);

		// then
		expect(await readFile(path.join(directory, "multi.txt"), "utf-8")).toBe("alpha\nONE\nbeta\nTWO\n");
	});

	it("#given codex patch with stacked contexts #when executed #then narrows before replacing", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(
			path.join(directory, "stacked.txt"),
			"class Alpha {\n  method() {\n    x = 1\n  }\n}\nclass Beta {\n  method() {\n    x = 1\n  }\n}\n",
			"utf-8",
		);
		const patch = `*** Begin Patch
*** Update File: stacked.txt
@@ class Beta {
@@   method() {
-    x = 1
+    x = 2
*** End Patch`;

		// when
		await applyPatch(directory, patch);

		// then
		expect(await readFile(path.join(directory, "stacked.txt"), "utf-8")).toBe(
			"class Alpha {\n  method() {\n    x = 1\n  }\n}\nclass Beta {\n  method() {\n    x = 2\n  }\n}\n",
		);
	});

	it("#given codex patch with heredoc wrapper #when executed #then strips wrapper", async () => {
		// given
		const directory = await createTempDirectory();
		const patch = `<<'EOF'
*** Begin Patch
*** Add File: heredoc.txt
+ok
*** End Patch
EOF`;

		// when
		await applyPatch(directory, patch);

		// then
		expect(await readFile(path.join(directory, "heredoc.txt"), "utf-8")).toBe("ok\n");
	});

	it("#given codex patch with end-of-file marker #when executed #then only matches file ending", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "eof.txt"), "target\nkeep\ntarget\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: eof.txt
@@
-target
+done
*** End of File
*** End Patch`;

		// when
		await applyPatch(directory, patch);

		// then
		expect(await readFile(path.join(directory, "eof.txt"), "utf-8")).toBe("target\nkeep\ndone\n");
	});

	it("#given codex patch with fuzzy context #when executed #then matches like codex", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "fuzzy.txt"), "name = “old”  \n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: fuzzy.txt
@@
-name = "old"
+name = "new"
*** End Patch`;

		// when
		await applyPatch(directory, patch);

		// then
		expect(await readFile(path.join(directory, "fuzzy.txt"), "utf-8")).toBe('name = "new"\n');
	});

	it("#given absolute workspace paths #when executed #then applies patch like codex", async () => {
		// given
		const directory = await createTempDirectory();
		const absoluteAddPath = path.join(directory, "absolute-add.txt");
		const absoluteDeletePath = path.join(directory, "absolute-delete.txt");
		const absoluteUpdatePath = path.join(directory, "absolute-update.txt");
		const absoluteMoveSourcePath = path.join(directory, "absolute-move-source.txt");
		const absoluteMoveDestinationPath = path.join(directory, "nested", "absolute-move-destination.txt");
		await writeFile(absoluteDeletePath, "delete me\n", "utf-8");
		await writeFile(absoluteUpdatePath, "before\n", "utf-8");
		await writeFile(absoluteMoveSourcePath, "move me\n", "utf-8");
		const patch = `*** Begin Patch
*** Add File: ${absoluteAddPath}
+created
*** Delete File: ${absoluteDeletePath}
*** Update File: ${absoluteUpdatePath}
@@
-before
+after
*** Update File: ${absoluteMoveSourcePath}
*** Move to: ${absoluteMoveDestinationPath}
@@
-move me
+moved
*** End Patch`;

		// when
		await applyPatch(directory, patch);

		// then
		expect(await readFile(absoluteAddPath, "utf-8")).toBe("created\n");
		await expect(readFile(absoluteDeletePath, "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readFile(absoluteUpdatePath, "utf-8")).toBe("after\n");
		await expect(readFile(absoluteMoveSourcePath, "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readFile(absoluteMoveDestinationPath, "utf-8")).toBe("moved\n");
	});

	it("#given rename-only codex patch #when executed #then moves file without changing content", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "old.txt"), "no trailing newline", "utf-8");
		const patch = `*** Begin Patch
*** Update File: old.txt
*** Move to: new.txt
*** End Patch`;

		// when
		await applyPatch(directory, patch);

		// then
		await expect(readFile(path.join(directory, "old.txt"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readFile(path.join(directory, "new.txt"), "utf-8")).toBe("no trailing newline");
	});

	it("#given absolute path outside cwd #when executed #then rejects the path", async () => {
		// given
		const directory = await createTempDirectory();
		const outsidePath = path.join(path.dirname(directory), `${path.basename(directory)}-outside-apply-patch.txt`);
		tempDirectories.push(outsidePath);
		const patch = `*** Begin Patch
*** Add File: ${outsidePath}
+outside
*** End Patch`;

		// when
		await expect(applyPatch(directory, patch)).rejects.toThrow("escapes workspace");

		// then
		await expect(readFile(outsidePath, "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("#given symlink escaping cwd #when executed #then rejects the path", async () => {
		// given
		const directory = await createTempDirectory();
		const outsideDirectory = await createTempDirectory();
		await symlink(outsideDirectory, path.join(directory, "link"), process.platform === "win32" ? "junction" : "dir");
		const patch = `*** Begin Patch
*** Add File: link/outside.txt
+outside
*** End Patch`;

		// when
		await expect(applyPatch(directory, patch)).rejects.toThrow("Symlink");

		// then
		await expect(readFile(path.join(outsideDirectory, "outside.txt"), "utf-8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("#given empty codex patch #when applying #then throws typed parse error", async () => {
		// given
		const directory = await createTempDirectory();
		const patch = `*** Begin Patch
*** End Patch`;

		// when / then
		await expect(applyPatch(directory, patch)).rejects.toBeInstanceOf(PatchParseError);
		await expect(applyPatchDetailed(directory, patch)).rejects.toBeInstanceOf(PatchParseError);
	});

	it("#given invalid codex hunk header #when executed #then reports parser diagnostic", async () => {
		// given
		const directory = await createTempDirectory();
		const patch = `*** Begin Patch
*** Frobnicate File: foo
*** End Patch`;

		// when / then
		await expect(applyPatch(directory, patch)).rejects.toThrow("is not a valid hunk header");
	});

	it("#given unsupported Move File syntax #when rejected #then explains direct move syntax and preserves files", async () => {
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "source.txt"), "keep me\n");
		const patch = `*** Begin Patch
*** Move File: source.txt -> destination.txt
*** End Patch`;
		await expect(applyPatch(directory, patch)).rejects.toThrow(
			"*** Update File: source-path\n*** Move to: destination-path",
		);
		expect(await readFile(path.join(directory, "source.txt"), "utf-8")).toBe("keep me\n");
		await expect(readFile(path.join(directory, "destination.txt"))).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("#given tool description examples #when applied in order #then create update move and delete work", async () => {
		const directory = await createTempDirectory();
		const examples = [
			...createApplyPatchTool().description.matchAll(/\*\*\* Begin Patch\n[\s\S]*?\*\*\* End Patch/g),
		].map((match) => match[0]);
		expect(examples).toHaveLength(4);
		const expectedSummaries = [
			["add: example.txt"],
			["update: example.txt"],
			["move: example.txt -> renamed-example.txt"],
			["delete: renamed-example.txt"],
		];
		for (const [index, example] of examples.entries()) {
			expect(await applyPatch(directory, example)).toEqual(expectedSummaries[index]);
		}
		expect(await readdir(directory)).toEqual([]);
	});

	it("#given missing codex context #when executed #then reports expected lines", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "modify.txt"), "line1\nline2\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: modify.txt
@@
-missing
+changed
*** End Patch`;

		// when / then
		await expect(applyPatch(directory, patch)).rejects.toThrow("Failed to find expected lines in modify.txt");
	});

	it("#given later validation failure #when applying detailed #then leaves every file unchanged", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "ok.txt"), "before\n", "utf-8");
		await writeFile(path.join(directory, "broken.txt"), "line\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: ok.txt
@@
-before
+after
*** Update File: broken.txt
@@
-missing
+changed
*** End Patch`;

		// when
		const result = await applyPatchDetailed(directory, patch);

		// then
		expect(result.appliedFiles).toEqual([]);
		expect(await readFile(path.join(directory, "ok.txt"), "utf-8")).toBe("before\n");
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0]?.filePath).toBe("broken.txt");
		expect(result.recoveryInstructions.mustReadFiles).toEqual(["broken.txt"]);
		expect(result.recoveryInstructions.mustNotReadFiles).toEqual([]);
	});

	it("#given partial patch failure #when applying compat api #then fails fast after first error", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "broken.txt"), "line\n", "utf-8");
		await writeFile(path.join(directory, "later.txt"), "before\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: broken.txt
@@
-missing
+changed
*** Update File: later.txt
@@
-before
+after
*** End Patch`;

		// when / then
		await expect(applyPatch(directory, patch)).rejects.toThrow("Failed to find expected lines in broken.txt");
		expect(await readFile(path.join(directory, "later.txt"), "utf-8")).toBe("before\n");
	});

	it("#given fuzzy matches across hunks #when applying detailed #then aggregates fuzz score", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "trim-end.txt"), "keep trailing   \n", "utf-8");
		await writeFile(path.join(directory, "normalize.txt"), "name = “old”\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: trim-end.txt
@@
-keep trailing
+keep trailing updated
*** Update File: normalize.txt
@@
-name = "old"
+name = "new"
*** End Patch`;

		// when
		const result = await applyPatchDetailed(directory, patch);

		// then
		expect(result.failures).toEqual([]);
		expect(result.details.fuzz).toBe(10001);
	});

	it("#given apply patch validation failure #when executed #then returns recovery instructions without writes", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "ok.txt"), "before\n", "utf-8");
		await writeFile(path.join(directory, "broken.txt"), "line\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: ok.txt
@@
-before
+after
*** Update File: broken.txt
@@
-missing
+changed
*** End Patch`;

		// when
		const result = await createApplyPatchTool().execute("apply-patch-test", { input: patch }, undefined, undefined, {
			cwd: directory,
		} as never);

		// then
		const text = result.content.find((block) => block.type === "text")?.text ?? "";
		expect(text).toContain("apply_patch failed.");
		expect(text).toContain("Failed:");
		expect(text).toContain("- broken.txt (update):");
		expect(text).toContain("Recovery: MUST read broken.txt before retrying.");
		expect(text).toContain("No file actions were applied.");
		expect(await readFile(path.join(directory, "ok.txt"), "utf-8")).toBe("before\n");
	});

	it("#given apply patch tool complete failure #when executed #then does not report partial failure", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "broken.txt"), "line\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: broken.txt
@@
-missing
+changed
*** End Patch`;

		// when
		const result = await createApplyPatchTool().execute("apply-patch-test", { input: patch }, undefined, undefined, {
			cwd: directory,
		} as never);

		// then
		const text = result.content.find((block) => block.type === "text")?.text ?? "";
		expect(text).toContain("apply_patch failed.");
		expect(text).not.toContain("partially failed");
		expect(text).toContain("No file actions were applied.");
	});

	it("#given update of missing file #when executed #then discloses ENOENT reason without reread advice", async () => {
		// given
		const directory = await createTempDirectory();
		const patch = `*** Begin Patch
*** Update File: missing.txt
@@
-old
+new
*** End Patch`;

		// when
		const result = await createApplyPatchTool().execute("apply-patch-test", { input: patch }, undefined, undefined, {
			cwd: directory,
		} as never);

		// then
		const text = result.content.find((block) => block.type === "text")?.text ?? "";
		expect(text).toContain("missing.txt");
		expect(text).toContain("ENOENT");
		expect(text).not.toContain("MUST read");
	});

	it("#given context mismatch on existing file #when executed #then discloses reason with reread advice", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "exists.txt"), "line\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: exists.txt
@@
-missing
+new
*** End Patch`;

		// when
		const result = await createApplyPatchTool().execute("apply-patch-test", { input: patch }, undefined, undefined, {
			cwd: directory,
		} as never);

		// then
		const text = result.content.find((block) => block.type === "text")?.text ?? "";
		expect(text).toContain("exists.txt");
		expect(text).toContain("MUST read exists.txt");
		expect(text).toMatch(/expected lines|context|find/i);
	});

	it("#given concurrent patches to different lines in one file #when applied #then preserves both updates", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "shared.txt"), "first\nsecond\n", "utf-8");
		const firstPatch = `*** Begin Patch
*** Update File: shared.txt
@@
-first
+FIRST
*** End Patch`;
		const secondPatch = `*** Begin Patch
*** Update File: shared.txt
@@
-second
+SECOND
*** End Patch`;

		// when
		await Promise.all([applyPatch(directory, firstPatch), applyPatch(directory, secondPatch)]);

		// then
		expect(await readFile(path.join(directory, "shared.txt"), "utf-8")).toBe("FIRST\nSECOND\n");
	});

	it("#given concurrent update and move of one file #when applied #then produces a serialized outcome", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "source.txt"), "first\nsecond\n", "utf-8");
		const updatePatch = `*** Begin Patch
*** Update File: source.txt
@@
-second
+SECOND
*** End Patch`;
		const movePatch = `*** Begin Patch
*** Update File: source.txt
*** Move to: destination.txt
@@
-first
+FIRST
*** End Patch`;

		// when
		const [updateResult, moveResult] = await Promise.all([
			applyPatchDetailed(directory, updatePatch),
			applyPatchDetailed(directory, movePatch),
		]);

		// then
		const failureCount = updateResult.failures.length + moveResult.failures.length;
		expect(failureCount === 0 || failureCount === 1).toBe(true);
		await expect(readFile(path.join(directory, "source.txt"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
		const destination = await readFile(path.join(directory, "destination.txt"), "utf-8");
		if (failureCount === 0) {
			expect(destination).toBe("FIRST\nSECOND\n");
		} else {
			expect(destination).toBe("FIRST\nsecond\n");
		}
	});

	it("#given successful patch write #when applying patch #then atomic temp files are cleaned", async () => {
		// given
		const directory = await createTempDirectory();
		await writeFile(path.join(directory, "atomic.txt"), "before\n", "utf-8");
		const patch = `*** Begin Patch
*** Update File: atomic.txt
@@
-before
+after
*** End Patch`;

		// when
		await applyPatch(directory, patch);

		// then
		expect(await readFile(path.join(directory, "atomic.txt"), "utf-8")).toBe("after\n");
		const files = await readdir(directory);
		expect(files.some((name) => name.includes(".tmp."))).toBe(false);
	});

	it("#given eexist on rename #when writing atomically #then retries after unlink", async () => {
		// given
		const calls: string[] = [];
		let renameCount = 0;
		const operations = {
			async writeFile() {
				calls.push("writeFile");
			},
			async rename() {
				renameCount += 1;
				calls.push(`rename:${renameCount}`);
				if (renameCount === 1) {
					const error = new Error("exists") as Error & { code?: string };
					error.code = "EEXIST";
					throw error;
				}
			},
			async unlink() {
				calls.push("unlink");
			},
		};

		// when
		await writeFileAtomic("/tmp/target.txt", "content", operations);

		// then
		expect(calls).toEqual(["writeFile", "rename:1", "unlink", "rename:2"]);
	});

	it("#given patch text #when extracting paths #then returns touched files", () => {
		// given
		const patch = `*** Begin Patch
*** Update File: src/app.ts
@@
-old
+new
*** Add File: src/new.ts
+content
*** Update File: src/old.ts
*** Move to: src/moved.ts
*** End Patch`;

		// when / then
		expect(extractPatchedPaths(patch)).toEqual(["src/app.ts", "src/new.ts", "src/old.ts", "src/moved.ts"]);
	});

	it.each([
		{ provider: "anthropic", id: "claude-sonnet" },
		{ provider: "google", id: "gemini" },
		{ provider: "deepseek", id: "deepseek-chat" },
		{ provider: "moonshot", id: "kimi" },
		{ provider: "zai", id: "glm" },
		{ provider: "qwen", id: "qwen" },
		{ provider: "openai", id: "gpt-5" },
		undefined,
	])("#given model %j #when lifecycle events fire #then keeps only apply_patch for edits", async (model) => {
		const harness = createToolsetTestApi(["read", "bash", "grep", "edit", "write"]);
		registerApplyPatchExtension(harness.api);
		for (const event of ["session_start", "model_select", "before_agent_start"]) {
			harness.setActiveTools(["read", "bash", "grep", "edit", "write"]);
			await harness.trigger(event, model);
			expect(harness.getActiveTools()).toEqual(["read", "bash", "grep", "apply_patch"]);
		}
	});
});
