import type { Model } from "@earendil-works/pi-ai";
import { stream as streamAnthropic } from "@earendil-works/pi-ai/api/anthropic-messages";
import { stream as streamGoogle } from "@earendil-works/pi-ai/api/google-generative-ai";
import { stream } from "@earendil-works/pi-ai/api/openai-responses";
import { afterEach, expect, it, vi } from "vitest";
import { APPLY_PATCH_LARK_GRAMMAR, createApplyPatchTool } from "../src/index.js";

afterEach(() => vi.restoreAllMocks());

it.each([true, false])(
	"#given grammar capability %s #when Pi prepares a request #then chooses the matching transport without network",
	async (supportsOpenAIGrammarTools) => {
		const model: Model<"openai-responses"> = {
			id: "test-model",
			name: "Test",
			api: "openai-responses",
			provider: "test-provider",
			baseUrl: "https://example.invalid/v1",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 4096,
			maxTokens: 128,
			compat: { supportsOpenAIGrammarTools },
		};
		let captured: unknown;
		const fetch = vi.fn<typeof globalThis.fetch>(() => {
			throw new Error("Network is forbidden in this test");
		});
		const result = await stream(
			model,
			{
				messages: [{ role: "user", content: "Create a file", timestamp: 0 }],
				tools: [createApplyPatchTool()],
			},
			{
				apiKey: "test-only",
				fetch,
				onPayload(payload) {
					captured = payload;
					throw new Error("Payload captured before network");
				},
			},
		).result();
		expect(fetch).not.toHaveBeenCalled();
		expect(result.errorMessage).toContain("Payload captured before network");
		expect(captured).toMatchObject({
			tools: [
				supportsOpenAIGrammarTools
					? {
							type: "custom",
							name: "apply_patch",
							format: { type: "grammar", syntax: "lark", definition: APPLY_PATCH_LARK_GRAMMAR },
						}
					: {
							type: "function",
							name: "apply_patch",
							parameters: { type: "object", required: ["input"], properties: { input: { type: "string" } } },
						},
			],
		});
	},
);

it.each(["anthropic-messages", "google-generative-ai"] as const)(
	"#given %s #when Pi prepares apply_patch #then emits a JSON function schema without network",
	async (api) => {
		const shared = {
			id: api === "anthropic-messages" ? "claude-sonnet-4" : "gemini-2.5-flash",
			name: "Test",
			provider: "test-provider",
			baseUrl: "https://example.invalid",
			reasoning: false,
			input: ["text"] satisfies ("text" | "image")[],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 4096,
			maxTokens: 128,
		};
		const context = {
			messages: [{ role: "user" as const, content: "Create a file", timestamp: 0 }],
			tools: [createApplyPatchTool()],
		};
		let captured: unknown;
		const fetch = vi.fn<typeof globalThis.fetch>(() => {
			throw new Error("Network is forbidden in this test");
		});
		vi.spyOn(globalThis, "fetch").mockImplementation(fetch);
		const options = {
			apiKey: "test-only",
			fetch,
			onPayload(payload: unknown) {
				captured = payload;
				throw new Error("Payload captured before network");
			},
		};
		const result = await (api === "anthropic-messages"
			? streamAnthropic({ ...shared, api }, context, options)
			: streamGoogle({ ...shared, api }, context, { apiKey: options.apiKey, onPayload: options.onPayload })
		).result();
		expect(fetch).not.toHaveBeenCalled();
		expect(result.errorMessage).toContain("Payload captured before network");
		const schema = { type: "object", required: ["input"], properties: { input: { type: "string" } } };
		expect(captured).toMatchObject(
			api === "anthropic-messages"
				? { tools: [{ name: "apply_patch", input_schema: schema }] }
				: {
						config: {
							tools: [{ functionDeclarations: [{ name: "apply_patch", parametersJsonSchema: schema }] }],
						},
					},
		);
	},
);
