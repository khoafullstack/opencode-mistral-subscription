// Subscription overlay: what differs from the built-in mistral catalog for a
// subscription key. Logic mirrors pi-mistral-subscription's mistral-overlay.

export type MediaInput = "text" | "image";

export type ReasoningVariant = {
	id: string;
	/** Value sent as the Mistral `reasoning_effort` provider option. */
	reasoningEffort: string;
};

export type SubscriptionModel = {
	id: string;
	name: string;
	context: number;
	output: number;
	input: MediaInput[];
	// Human-readable reasoning levels accepted by the API (checked 2026-10-31
	// in the Pi package; re-check when Mistral changes things).
	reasoning: string[] | null;
	/** Selectable `#variant`s; OpenCode merges `reasoningEffort` into settings. */
	variants: ReasoningVariant[];
};

/**
 * Map reasoning levels to selectable variants. Mirrors Pi's
 * thinkingLevelMap: every level is sent verbatim as `reasoning_effort`,
 * except `off`, which Pi sends as `"none"`.
 */
export function toVariants(
	reasoning: readonly string[] | null,
): ReasoningVariant[] {
	if (!reasoning) return [];
	return reasoning.map((level) => ({
		id: level,
		reasoningEffort: level === "off" ? "none" : level,
	}));
}

export const PROVIDER_ID = "mistral-subscription";
export const INTEGRATION_ID = "mistral-subscription";
export const OAUTH_METHOD_ID = "browser";
export const BASE_URL = "https://api.mistral.ai/v1";
export const LARGE_4_MAX_TOKENS = 32_768;

// In the catalog, but a subscription key cannot call them (Pi checked
// 2026-10-31: "Invalid model", or 403 for the Labs model).
export const UNAVAILABLE_MODELS: ReadonlySet<string> = new Set([
	"devstral-medium-2507",
	"devstral-small-2505",
	"devstral-small-2507",
	"labs-leanstral-1-5-1",
	"mistral-large-2411",
	"mistral-large-4-0-8",
	"mistral-nemo",
	"pixtral-large-latest",
]);

// Fallback definitions used when the host catalog lacks them (e.g. before the
// online catalog arrives). Values mirror pi-mistral-subscription MODELS.
export const FALLBACK_MODELS: readonly SubscriptionModel[] = [
	{
		id: "mistral-medium-3.5",
		name: "Mistral Medium 3.5 (subscription)",
		context: 262144,
		output: 262144,
		input: ["text", "image"],
		reasoning: ["off", "high"],
		variants: toVariants(["off", "high"]),
	},
	{
		id: "mistral-medium-latest",
		name: "Mistral Medium (subscription)",
		context: 262144,
		output: 262144,
		input: ["text", "image"],
		reasoning: ["off", "high"],
		variants: toVariants(["off", "high"]),
	},
	{
		id: "mistral-small-latest",
		name: "Mistral Small 4 (subscription)",
		context: 256000,
		output: 256000,
		input: ["text", "image"],
		reasoning: ["off", "high"],
		variants: toVariants(["off", "high"]),
	},
	{
		id: "mistral-large-4",
		name: "Mistral Large 4 Preview (subscription)",
		context: 1_000_000,
		output: 32_768,
		input: ["text", "image"],
		reasoning: ["low", "medium", "high"],
		variants: toVariants(["low", "medium", "high"]),
	},
	{
		id: "mistral-large-latest",
		name: "Mistral Large 3 (subscription)",
		context: 262144,
		output: 262144,
		input: ["text", "image"],
		reasoning: null,
		variants: [],
	},
	{
		id: "zai-glm-5-3",
		name: "GLM 5.3 (subscription)",
		context: 1_048_576,
		output: 128_000,
		input: ["text"],
		reasoning: ["low", "high", "max"],
		variants: toVariants(["low", "high", "max"]),
	},
	{
		id: "zai-glm-5-3-flash",
		name: "GLM 5.3 Flash (subscription)",
		context: 1_048_576,
		output: 128_000,
		input: ["text", "image"],
		reasoning: ["low", "high", "max"],
		variants: toVariants(["low", "high", "max"]),
	},
];

const ALWAYS_OFFERED = new Set([
	"mistral-large-4",
	"zai-glm-5-3",
	"zai-glm-5-3-flash",
]);

function adjust(entry: SubscriptionModel): SubscriptionModel {
	switch (entry.id) {
		case "mistral-large-4":
			return {
				...entry,
				output: Math.min(entry.output, LARGE_4_MAX_TOKENS),
				reasoning: ["low", "medium", "high"],
			};
		case "glm-5-2":
		case "zai-glm-5-2":
			return {
				...entry,
				reasoning: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
			};
		case "deepseek-v4-1-flash-1017":
			return {
				...entry,
				input: ["text", "image"],
				reasoning: ["off", "low", "high", "xhigh", "max"],
			};
		case "zai-glm-5-3":
		case "zai-glm-5-3-flash":
			return { ...entry, reasoning: ["low", "high", "max"] };
		case "mistral-medium-3.5":
		case "mistral-medium-latest":
		case "mistral-small-latest":
			return { ...entry, reasoning: ["off", "high"] };
		default:
			return entry;
	}
}

/** Minimal host-catalog view the overlay needs. */
export type CatalogEntry = {
	id: string;
	name?: string;
	context?: number;
	output?: number;
	input?: MediaInput[];
};

export function buildSubscriptionModels(
	catalog: readonly CatalogEntry[],
): SubscriptionModel[] {
	const known = new Set(catalog.map((m) => m.id));
	const available = catalog.filter((m) => !UNAVAILABLE_MODELS.has(m.id));
	const fallbacks = FALLBACK_MODELS.filter(
		(m) => ALWAYS_OFFERED.has(m.id) && !known.has(m.id),
	).map(
		(m) =>
			({
				id: m.id,
				name: m.name,
				context: m.context,
				output: m.output,
				input: m.input,
			}) as CatalogEntry,
	);
	const merged: CatalogEntry[] = [...available, ...fallbacks];
	const byId = new Map<string, CatalogEntry>();
	for (const m of merged) if (!byId.has(m.id)) byId.set(m.id, m);
	const fallbackById = new Map(FALLBACK_MODELS.map((m) => [m.id, m]));
	return [...byId.values()].map((m) => {
		const fb = fallbackById.get(m.id);
		const base = {
			id: m.id,
			name: m.name ?? fb?.name ?? m.id,
			context: m.context ?? fb?.context ?? 262144,
			output: m.output ?? fb?.output ?? 262144,
			input: m.input ?? fb?.input ?? (["text"] as MediaInput[]),
			reasoning: fb?.reasoning ?? null,
			variants: [],
		};
		const adjusted = adjust(base);
		return { ...adjusted, variants: toVariants(adjusted.reasoning) };
	});
}
