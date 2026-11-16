import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";
import {
	createCodeChallenge,
	createCodeVerifier,
	createMistralSubscriptionLogin,
	exchangeForApiKey,
	pollSignIn,
} from "../src/mistral-oauth.ts";

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const fixedBytes = () => Buffer.alloc(64, 7);
const noSleep = async () => {};
const frozenNow = (t: number) => () => t;

function startPayload() {
	return {
		process_id: "proc-1",
		sign_in_url: "https://console.mistral.ai/vibe/sign-in?x=1",
		poll_url: "https://console.mistral.ai/api/vibe/sign-in/proc-1",
		expires_at: new Date(frozenNow(1_000)() + 60_000).toISOString(),
	};
}

describe("pkce", () => {
	it("creates a url-safe verifier and S256 challenge", () => {
		const verifier = createCodeVerifier({ randomBytes: fixedBytes });
		assert.match(verifier, /^[A-Za-z0-9_-]+$/);
		assert.equal(
			createCodeChallenge("verifier"),
			createCodeChallenge("verifier"),
		);
		assert.equal(createCodeChallenge("a") === createCodeChallenge("b"), false);
	});
});

describe("login flow", () => {
	it("polls pending then completes and exchanges for an api key", async () => {
		const calls: string[] = [];
		const fetch = async (
			url: string,
			init?: RequestInit,
		): Promise<Response> => {
			calls.push(`${init?.method ?? "GET"} ${url}`);
			if (url.endsWith("/vibe/sign-in") && init?.method === "POST")
				return jsonResponse(startPayload());
			if (url.endsWith("/proc-1") && (!init?.method || init.method === "GET")) {
				const pending = calls.filter((c) => c.includes("/proc-1")).length;
				if (pending <= 1) return jsonResponse({ status: "pending" });
				return jsonResponse({ status: "completed", exchange_token: "ex-tok" });
			}
			if (url.endsWith("/exchange"))
				return jsonResponse({ api_key: "key-part1part2" });
			throw new Error(`unexpected ${url}`);
		};
		const login = createMistralSubscriptionLogin({
			fetch,
			sleep: noSleep,
			now: frozenNow(1_000),
			randomBytes: fixedBytes,
		});
		const { apiKey, expires } = await login.login({});
		assert.equal(apiKey, "key-part1part2");
		assert.ok(expires > 1_000);
		assert.ok(calls.some((c) => c.includes("/exchange")));
	});

	it("maps 410 to expired", async () => {
		const r = await pollSignIn(
			async () => new Response("", { status: 410 }),
			"https://console.mistral.ai/api/vibe/x",
		);
		assert.equal(r.status, "expired");
	});

	it("rejects denied, error, missing token, timeout and bad urls", async () => {
		const denied: import("../src/mistral-oauth.ts").FetchLike = async () =>
			jsonResponse({ status: "denied" });
		await assert.rejects(
			pollSignIn(denied, "https://console.mistral.ai/api/vibe/x").then(
				async () => {
					const login = createMistralSubscriptionLogin({
						fetch: denied,
						sleep: noSleep,
						now: frozenNow(1_000),
						randomBytes: fixedBytes,
					});
					const attempt = {
						processId: "p",
						signInUrl: "https://console.mistral.ai/vibe/a",
						pollUrl: "https://console.mistral.ai/api/vibe/x",
						expiresAt: 2_000,
					};
					await login.finish(attempt, "v", {});
				},
			),
			/denied/,
		);

		const err: import("../src/mistral-oauth.ts").FetchLike = async () =>
			jsonResponse({ status: "error", message: "boom" });
		await assert.rejects(
			createMistralSubscriptionLogin({
				fetch: err,
				sleep: noSleep,
				now: frozenNow(1_000),
				randomBytes: fixedBytes,
			}).finish(
				{
					processId: "p",
					signInUrl: "https://console.mistral.ai/vibe/a",
					pollUrl: "https://console.mistral.ai/api/vibe/x",
					expiresAt: 9_999,
				},
				"v",
				{},
			),
			/boom/,
		);

		const noToken: import("../src/mistral-oauth.ts").FetchLike = async () =>
			jsonResponse({ status: "completed" });
		await assert.rejects(
			createMistralSubscriptionLogin({
				fetch: noToken,
				sleep: noSleep,
				now: frozenNow(1_000),
				randomBytes: fixedBytes,
			}).finish(
				{
					processId: "p",
					signInUrl: "https://console.mistral.ai/vibe/a",
					pollUrl: "https://console.mistral.ai/api/vibe/x",
					expiresAt: 9_999,
				},
				"v",
				{},
			),
			/without an exchange token/,
		);

		const pending: import("../src/mistral-oauth.ts").FetchLike = async () =>
			jsonResponse({ status: "pending" });
		await assert.rejects(
			createMistralSubscriptionLogin({
				fetch: pending,
				sleep: noSleep,
				now: frozenNow(50_000),
				randomBytes: fixedBytes,
			}).finish(
				{
					processId: "p",
					signInUrl: "https://console.mistral.ai/vibe/a",
					pollUrl: "https://console.mistral.ai/api/vibe/x",
					expiresAt: 1_000,
				},
				"v",
				{},
			),
			/timed out/,
		);

		const evil: import("../src/mistral-oauth.ts").FetchLike = async () =>
			jsonResponse({
				...startPayload(),
				sign_in_url: "https://evil.example/phish",
			});
		await assert.rejects(
			createMistralSubscriptionLogin({
				fetch: evil,
				sleep: noSleep,
				now: frozenNow(1_000),
				randomBytes: fixedBytes,
			}).start(),
			/unexpected URL/,
		);
	});

	it("exchange requires api_key", async () => {
		await assert.rejects(
			exchangeForApiKey(async () => jsonResponse({}), "p", "t", "v"),
			/missing api_key/,
		);
	});
});
