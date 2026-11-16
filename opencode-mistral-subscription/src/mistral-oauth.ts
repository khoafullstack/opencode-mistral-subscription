import { createHash, randomBytes } from "node:crypto";

export const BROWSER_AUTH_BASE_URL = "https://console.mistral.ai";
export const BROWSER_AUTH_API_BASE_URL = "https://console.mistral.ai/api";
export const SIGN_IN_PATH = "/vibe/sign-in";
export const API_KEY_EXPIRES_MS = 10 * 365 * 24 * 60 * 60 * 1000;
export const POLL_INTERVAL_MS = 3000;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;
export type Now = () => number;

export type MistralOAuthDeps = {
	fetch?: FetchLike;
	sleep?: Sleep;
	now?: Now;
	randomBytes?: (size: number) => Buffer;
};

export type AuthCallbacks = {
	signal?: AbortSignal;
};

export type SignInProcess = {
	processId: string;
	signInUrl: string;
	pollUrl: string;
	expiresAt: number;
};

export type PollResult = {
	status: "pending" | "completed" | "expired" | "denied" | "error";
	exchangeToken?: string;
	message?: string;
};

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64Url(bytes: Buffer): string {
	return bytes.toString("base64url");
}

export function createCodeVerifier(deps: MistralOAuthDeps): string {
	return base64Url((deps.randomBytes ?? randomBytes)(64));
}

export function createCodeChallenge(verifier: string): string {
	return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function responseJson(
	response: Response,
	message: string,
): Promise<unknown> {
	if (!response.ok) throw new Error(`${message} HTTP ${response.status}`);
	try {
		return await response.json();
	} catch (error) {
		throw new Error(`${message} response was malformed`, { cause: error });
	}
}

function stringField(
	record: Record<string, unknown>,
	field: string,
	message: string,
): string {
	const value = record[field];
	if (typeof value === "string" && value.length > 0) return value;
	throw new Error(`${message} response was missing ${field}`);
}

function optionalStringField(
	record: Record<string, unknown>,
	field: string,
): string | undefined {
	const value = record[field];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function validateUrlAgainstBaseUrl(
	value: string,
	baseUrl: string,
	message: string,
): string {
	const current = new URL(value);
	const base = new URL(baseUrl);
	if (
		current.origin !== base.origin ||
		!current.pathname.startsWith(base.pathname.replace(/\/$/, ""))
	) {
		throw new Error(`${message} returned an unexpected URL`);
	}
	return value;
}

export async function createSignInProcess(
	fetch: FetchLike,
	codeChallenge: string,
): Promise<SignInProcess> {
	const message = "Failed to start Mistral browser sign-in";
	const response = await fetch(`${BROWSER_AUTH_API_BASE_URL}${SIGN_IN_PATH}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
		}),
	});
	const payload = await responseJson(response, message);
	if (!isRecord(payload)) throw new Error(`${message} response was malformed`);
	const signInUrl = stringField(payload, "sign_in_url", message);
	const pollUrl = stringField(payload, "poll_url", message);
	const expiresAt = Date.parse(stringField(payload, "expires_at", message));
	if (!Number.isFinite(expiresAt))
		throw new Error(`${message} response had an invalid expires_at`);
	return {
		processId: stringField(payload, "process_id", message),
		signInUrl: validateUrlAgainstBaseUrl(
			signInUrl,
			BROWSER_AUTH_BASE_URL,
			message,
		),
		pollUrl: validateUrlAgainstBaseUrl(
			pollUrl,
			BROWSER_AUTH_API_BASE_URL,
			message,
		),
		expiresAt,
	};
}

export async function pollSignIn(
	fetch: FetchLike,
	pollUrl: string,
): Promise<PollResult> {
	const message = "Mistral browser sign-in status could not be retrieved";
	const response = await fetch(
		validateUrlAgainstBaseUrl(pollUrl, BROWSER_AUTH_API_BASE_URL, message),
	);
	if (response.status === 410) return { status: "expired" };
	const payload = await responseJson(response, message);
	if (!isRecord(payload)) throw new Error(`${message} response was malformed`);
	const status = payload.status;
	if (
		status !== "pending" &&
		status !== "completed" &&
		status !== "expired" &&
		status !== "denied" &&
		status !== "error"
	) {
		throw new Error("Mistral browser sign-in returned an unknown state");
	}
	return {
		status,
		exchangeToken: optionalStringField(payload, "exchange_token"),
		message: optionalStringField(payload, "message"),
	};
}

export async function waitForExchangeToken(
	fetch: FetchLike,
	attempt: SignInProcess,
	callbacks: AuthCallbacks,
	sleep: Sleep,
	now: Now,
): Promise<string> {
	while (now() < attempt.expiresAt) {
		if (callbacks.signal?.aborted)
			throw new Error("Mistral browser sign-in was cancelled");
		const result = await pollSignIn(fetch, attempt.pollUrl);
		switch (result.status) {
			case "pending":
				await sleep(
					Math.min(POLL_INTERVAL_MS, Math.max(0, attempt.expiresAt - now())),
				);
				break;
			case "completed":
				if (result.exchangeToken) return result.exchangeToken;
				throw new Error(
					"Mistral browser sign-in completed without an exchange token",
				);
			case "expired":
				throw new Error("Mistral browser sign-in expired");
			case "denied":
				throw new Error("Mistral browser sign-in was denied");
			case "error":
				throw new Error(result.message ?? "Mistral browser sign-in failed");
		}
	}
	throw new Error("Mistral browser sign-in timed out");
}

export async function exchangeForApiKey(
	fetch: FetchLike,
	processId: string,
	exchangeToken: string,
	codeVerifier: string,
): Promise<string> {
	const message = "Failed to exchange Mistral browser sign-in for an API key";
	const response = await fetch(
		`${BROWSER_AUTH_API_BASE_URL}${SIGN_IN_PATH}/${processId}/exchange`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				exchange_token: exchangeToken,
				code_verifier: codeVerifier,
			}),
		},
	);
	const payload = await responseJson(response, message);
	if (!isRecord(payload)) throw new Error(`${message} response was malformed`);
	return stringField(payload, "api_key", message);
}

export function createMistralSubscriptionLogin(deps: MistralOAuthDeps = {}) {
	const fetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
	const sleep = deps.sleep ?? defaultSleep;
	const now = deps.now ?? Date.now;
	return {
		async start(): Promise<{
			attempt: SignInProcess;
			codeVerifier: string;
		}> {
			const codeVerifier = createCodeVerifier(deps);
			const attempt = await createSignInProcess(
				fetch,
				createCodeChallenge(codeVerifier),
			);
			return { attempt, codeVerifier };
		},
		async finish(
			attempt: SignInProcess,
			codeVerifier: string,
			callbacks: AuthCallbacks = {},
		): Promise<string> {
			const exchangeToken = await waitForExchangeToken(
				fetch,
				attempt,
				callbacks,
				sleep,
				now,
			);
			return exchangeForApiKey(
				fetch,
				attempt.processId,
				exchangeToken,
				codeVerifier,
			);
		},
		async login(
			callbacks: AuthCallbacks = {},
		): Promise<{ apiKey: string; expires: number }> {
			const codeVerifier = createCodeVerifier(deps);
			const attempt = await createSignInProcess(
				fetch,
				createCodeChallenge(codeVerifier),
			);
			const exchangeToken = await waitForExchangeToken(
				fetch,
				attempt,
				callbacks,
				sleep,
				now,
			);
			const apiKey = await exchangeForApiKey(
				fetch,
				attempt.processId,
				exchangeToken,
				codeVerifier,
			);
			return { apiKey, expires: now() + API_KEY_EXPIRES_MS };
		},
	};
}
