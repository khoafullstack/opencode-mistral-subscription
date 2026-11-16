import { Model, Plugin, Provider } from "@opencode/plugin";
import {
	BASE_URL,
	buildSubscriptionModels,
	FALLBACK_MODELS,
	INTEGRATION_ID,
	OAUTH_METHOD_ID,
	PROVIDER_ID,
} from "./mistral-catalog.ts";
import {
	API_KEY_EXPIRES_MS,
	createMistralSubscriptionLogin,
} from "./mistral-oauth.ts";

const INSTRUCTIONS =
	"Sign in with your Mistral Pro or higher account, then return to OpenCode.";

function toProviderID(value: string): never {
	return value as never;
}

export default Plugin.define({
	id: "mistral-subscription",
	async setup(ctx) {
		await ctx.integration.transform((editor) => {
			editor.method.update({
				integrationID: INTEGRATION_ID as never,
				method: {
					id: OAUTH_METHOD_ID,
					type: "oauth",
					label: "Sign in with Mistral subscription",
				},
				authorize: async () => {
					const login = createMistralSubscriptionLogin();
					const { attempt, codeVerifier } = await login.start();
					return {
						url: attempt.signInUrl,
						instructions: INSTRUCTIONS,
						expiresAt: attempt.expiresAt,
						mode: "auto" as const,
						callback: (async () => {
							const apiKey = await login.finish(attempt, codeVerifier, {});
							return {
								type: "oauth",
								methodID: OAUTH_METHOD_ID as never,
								refresh: "mistral-browser-sign-in",
								access: apiKey,
								expires: Date.now() + API_KEY_EXPIRES_MS,
							};
						})() as never,
					};
				},
				refresh: (async (credential: unknown) => ({
					...(credential as object),
					expires: Date.now() + API_KEY_EXPIRES_MS,
				})) as never,
			});
		});

		await ctx.provider.transform((editor) => {
			const base = editor.get("mistral" as never) as
				| { models: ReadonlyMap<string, Record<string, unknown>> }
				| undefined;
			const catalog = base
				? [...base.models.entries()].map(([id, m]) => ({
						id,
						name: typeof m.name === "string" ? (m.name as string) : undefined,
						context: (m.limit as { context?: number } | undefined)?.context,
						output: (m.limit as { output?: number } | undefined)?.output,
						input: (
							m.capabilities as { input?: string[] } | undefined
						)?.input?.filter(
							(v): v is "text" | "image" => v === "text" || v === "image",
						),
					}))
				: [];
			const models = buildSubscriptionModels(catalog);
			const providerID = toProviderID(PROVIDER_ID);
			const info = {
				...Provider.Info.empty(providerID),
				name: "Mistral subscription",
				activation: "enabled",
				package: "@opencode/ai/providers/mistral",
				settings: { baseURL: BASE_URL },
				integrationID: INTEGRATION_ID,
			};
			const infos = models.map((m) => {
				const modelID = m.id as never;
				const baseInfo = Model.Info.default(providerID, modelID);
				return {
					...baseInfo,
					name: m.name,
					limit: { context: m.context, output: m.output },
					capabilities: {
						...(baseInfo as { capabilities: object }).capabilities,
						tools: true,
						input: [...m.input],
						output: ["text"],
					},
					variants: m.variants.map((v) => ({
						id: v.id,
						settings: { reasoningEffort: v.reasoningEffort },
					})),
					cost: [],
					status: "active",
					enabled: true,
				};
			});
			try {
				editor.add({ info: info as never, models: infos as never });
			} catch {
				// Provider already registered (e.g. reload): replace its inventory.
				editor.models.set(providerID as never, infos as never);
				editor.update(providerID as never, (draft) => {
					const d = draft as unknown as Record<string, unknown>;
					d.name = "Mistral subscription";
					d.package = "@opencode/ai/providers/mistral";
					d.settings = { baseURL: BASE_URL };
					d.integrationID = INTEGRATION_ID;
				});
			}
			void FALLBACK_MODELS;
		});

		await ctx.command.transform((editor) => {
			editor.add({
				name: "mistral-subscription-status",
				description:
					"Show how the Mistral subscription sign-in is wired into OpenCode",
				execute: async ({ sessionID, prompt, delivery }) => {
					await ctx.session.prompt({
						...prompt,
						sessionID,
						text: `${prompt.text}\n\nmistral-subscription uses Mistral AI Studio browser sign-in via /connect and OpenCode built-in models with subscription overlay.`,
						delivery,
					});
				},
			});
		});
	},
});
