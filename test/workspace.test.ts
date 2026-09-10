import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { applyPatch, applyPatchDetailed } from "../src/index.js";

const directories: string[] = [];
async function workspace(): Promise<string> {
	const directory = await mkdtemp(path.join(process.cwd(), "test-temp-"));
	directories.push(directory);
	return directory;
}
afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it.each(["alias/file.txt", "alias/../new.txt", "file-link.txt", "dangling.txt"])(
	"#given symlink path %s #when validating #then rejects without any writes",
	async (target) => {
		const cwd = await workspace();
		await mkdir(path.join(cwd, "real"));
		await writeFile(path.join(cwd, "real/file.txt"), "original\n");
		await symlink("real", path.join(cwd, "alias"), "dir");
		await symlink("real/file.txt", path.join(cwd, "file-link.txt"), "file");
		await symlink("absent", path.join(cwd, "dangling.txt"), "file");
		const result = await applyPatchDetailed(
			cwd,
			`*** Begin Patch
*** Add File: first.txt
+first
*** Add File: ${target}
+new
*** End Patch`,
		);
		expect(result.failures[0]?.message).toContain("Symlink");
		expect(result.appliedFiles).toEqual([]);
		await expect(readFile(path.join(cwd, "first.txt"))).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readFile(path.join(cwd, "real/file.txt"), "utf8")).toBe("original\n");
	},
);

it.each(["existing.txt", "link/file.txt", "../outside.txt"])(
	"#given disallowed move destination %s #when validating #then preserves source and other files",
	async (target) => {
		const cwd = await workspace();
		await writeFile(path.join(cwd, "source.txt"), "source\n");
		await writeFile(path.join(cwd, "existing.txt"), "existing\n");
		await symlink(".", path.join(cwd, "link"), "dir");
		await expect(
			applyPatch(
				cwd,
				`*** Begin Patch
*** Add File: first.txt
+first
*** Update File: source.txt
*** Move to: ${target}
*** End Patch`,
			),
		).rejects.toThrow();
		expect(await readFile(path.join(cwd, "source.txt"), "utf8")).toBe("source\n");
		expect(await readFile(path.join(cwd, "existing.txt"), "utf8")).toBe("existing\n");
		await expect(readFile(path.join(cwd, "first.txt"))).rejects.toMatchObject({ code: "ENOENT" });
	},
);

it.each([
	"*** Add File: a.txt\n+one\n*** Add File: ./a.txt\n+two",
	"*** Add File: folder\n+one\n*** Add File: folder/file.txt\n+two",
	"*** Update File: source.txt\n*** Move to: moved.txt\n*** Add File: moved.txt\n+two",
	"*** Update File: source.txt\n@@\n-source\n+one\n*** Delete File: source.txt",
])("#given overlapping operations #when validating #then leaves workspace unchanged", async (operations) => {
	const cwd = await workspace();
	await writeFile(path.join(cwd, "source.txt"), "source\n");
	const result = await applyPatchDetailed(cwd, `*** Begin Patch\n${operations}\n*** End Patch`);
	expect(result.failures[0]?.message).toContain("Overlapping");
	expect(result.appliedFiles).toEqual([]);
	expect(await readFile(path.join(cwd, "source.txt"), "utf8")).toBe("source\n");
});

it("#given concurrent patches to one new file #when applying #then only one creation succeeds", async () => {
	const cwd = await workspace();
	const results = await Promise.all(
		["one", "two"].map((value) =>
			applyPatchDetailed(cwd, `*** Begin Patch\n*** Add File: new.txt\n+${value}\n*** End Patch`),
		),
	);
	expect(results.filter((result) => result.failures.length === 0)).toHaveLength(1);
	expect(results.filter((result) => result.failures[0]?.code === "EEXIST")).toHaveLength(1);
	expect(["one\n", "two\n"]).toContain(await readFile(path.join(cwd, "new.txt"), "utf8"));
});

it("#given a file used as a parent #when validating a later operation #then no earlier file is created", async () => {
	const cwd = await workspace();
	await writeFile(path.join(cwd, "parent"), "file\n");
	const result = await applyPatchDetailed(
		cwd,
		`*** Begin Patch
*** Add File: first.txt
+first
*** Add File: parent/child.txt
+child
*** End Patch`,
	);
	expect(result.failures[0]?.code).toBe("ENOTDIR");
	await expect(readFile(path.join(cwd, "first.txt"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("#given hard-linked paths #when used in separate operations #then rejects aliases", async () => {
	const cwd = await workspace();
	await writeFile(path.join(cwd, "source.txt"), "source\n");
	await link(path.join(cwd, "source.txt"), path.join(cwd, "alias.txt"));
	const result = await applyPatchDetailed(
		cwd,
		`*** Begin Patch
*** Delete File: source.txt
*** Delete File: alias.txt
*** End Patch`,
	);
	expect(result.failures[0]?.message).toContain("Overlapping");
	expect(await readFile(path.join(cwd, "source.txt"), "utf8")).toBe("source\n");
});

it("#given new paths differing only by case #when validating #then rejects overlap on every filesystem", async () => {
	const cwd = await workspace();
	const result = await applyPatchDetailed(
		cwd,
		`*** Begin Patch
*** Add File: new.txt
+one
*** Add File: NEW.txt
+two
*** End Patch`,
	);
	expect(result.appliedFiles).toEqual([]);
	expect(result.failures[0]?.message).toContain("Overlapping");
	await expect(readFile(path.join(cwd, "new.txt"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("#given write-time collision after progress #when writing #then stops and reports previous writes", async () => {
	const cwd = await workspace();
	const result = await applyPatchDetailed(
		cwd,
		`*** Begin Patch
*** Add File: first.txt
+first
*** Add File: second.txt
+second
*** Add File: third.txt
+third
*** End Patch`,
		async (progress) => {
			if (progress.applied === 1 && progress.failed === 0)
				await writeFile(path.join(cwd, "second.txt"), "external\n");
		},
	);
	expect(result.appliedFiles).toEqual(["first.txt"]);
	expect(result.hasPartialSuccess).toBe(true);
	expect(result.failures[0]?.code).toBe("EEXIST");
	expect(await readFile(path.join(cwd, "first.txt"), "utf8")).toBe("first\n");
	expect(await readFile(path.join(cwd, "second.txt"), "utf8")).toBe("external\n");
	await expect(readFile(path.join(cwd, "third.txt"))).rejects.toMatchObject({ code: "ENOENT" });
});

it.each([
	"garbage\n*** Delete File: source.txt",
	"*** Delete File: source.txt\ngarbage",
	"*** Update File: source.txt\n@@\n-source\n+changed\ngarbage",
])("#given stray syntax in patch #when validating #then no files change", async (operations) => {
	const cwd = await workspace();
	await writeFile(path.join(cwd, "source.txt"), "source\n");
	await expect(applyPatch(cwd, `*** Begin Patch\n${operations}\n*** End Patch`)).rejects.toThrow();
	expect(await readFile(path.join(cwd, "source.txt"), "utf8")).toBe("source\n");
});
