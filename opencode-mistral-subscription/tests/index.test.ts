import assert from "node:assert/strict";
import { describe, it } from "node:test";
import plugin from "../src/index.ts";

describe("plugin shape", () => {
	it("registers as mistral-subscription with a setup hook", () => {
		assert.equal(plugin.id, "mistral-subscription");
		assert.equal(typeof plugin.setup, "function");
	});
});
