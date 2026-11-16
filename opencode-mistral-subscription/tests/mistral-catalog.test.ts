import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildSubscriptionModels,
	FALLBACK_MODELS,
	toVariants,
	UNAVAILABLE_MODELS,
} from "../src/mistral-catalog.ts";

describe("subscription catalog overlay", () => {
	it("filters models a subscription key cannot call", () => {
		const out = buildSubscriptionModels([
			{ id: "mistral-medium-3.5" },
			{ id: "mistral-nemo" },
			{ id: "pixtral-large-latest" },
		]);
		const ids = out.map((m) => m.id);
		assert.ok(ids.includes("mistral-medium-3.5"));
		for (const banned of UNAVAILABLE_MODELS)
			assert.ok(!ids.includes(banned), banned);
	});

	it("adds fallbacks when the host catalog lacks them, without duplicates", () => {
		const empty = buildSubscriptionModels([]);
		for (const id of ["mistral-large-4", "zai-glm-5-3", "zai-glm-5-3-flash"]) {
			assert.ok(
				empty.some((m) => m.id === id),
				id,
			);
		}
		const withLarge = buildSubscriptionModels([
			{
				id: "mistral-large-4",
				name: "L4",
				context: 10,
				output: 20,
				input: ["text"],
			},
		]);
		assert.equal(withLarge.filter((m) => m.id === "mistral-large-4").length, 1);
		assert.equal(
			withLarge.find((m) => m.id === "mistral-large-4")?.context,
			10,
		);
	});

	it("caps Large 4 and keeps subscription reasoning levels", () => {
		const out = buildSubscriptionModels([
			{
				id: "mistral-large-4",
				context: 1_000_000,
				output: 262_144,
				input: ["text", "image"],
			},
		]);
		const large = out.find((m) => m.id === "mistral-large-4");
		assert.equal(large?.output, 32_768);
		assert.deepEqual(large?.reasoning, ["low", "medium", "high"]);
	});

	it("enables image input for DeepSeek and keeps fallback metadata", () => {
		const out = buildSubscriptionModels([{ id: "deepseek-v4-1-flash-1017" }]);
		assert.deepEqual(
			out.find((m) => m.id === "deepseek-v4-1-flash-1017")?.input,
			["text", "image"],
		);
		assert.ok(FALLBACK_MODELS.length >= 7);
	});

	it("maps reasoning levels to selectable variants", () => {
		assert.deepEqual(toVariants(null), []);
		assert.deepEqual(toVariants(["low", "high"]), [
			{ id: "low", reasoningEffort: "low" },
			{ id: "high", reasoningEffort: "high" },
		]);
		// Pi sends "off" as reasoning_effort "none".
		assert.deepEqual(toVariants(["off", "high"]), [
			{ id: "off", reasoningEffort: "none" },
			{ id: "high", reasoningEffort: "high" },
		]);
	});

	it("attaches effort variants per model", () => {
		const out = buildSubscriptionModels([
			{ id: "mistral-large-4", context: 1_000_000, output: 262_144 },
			{ id: "mistral-medium-3.5" },
			{ id: "mistral-large-latest" },
		]);
		assert.deepEqual(
			out.find((m) => m.id === "mistral-large-4")?.variants,
			toVariants(["low", "medium", "high"]),
		);
		assert.deepEqual(
			out.find((m) => m.id === "mistral-medium-3.5")?.variants,
			toVariants(["off", "high"]),
		);
		assert.deepEqual(
			out.find((m) => m.id === "mistral-large-latest")?.variants,
			[],
		);
	});
});
