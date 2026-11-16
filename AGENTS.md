# AGENTS.md

Guidance for coding agents working in this repository.

## What this is

A workspace for the **`opencode-mistral-subscription`** OpenCode V2 plugin: it
adds a `mistral-subscription` provider that signs in through Mistral AI Studio
in the browser and overlays the host `mistral` model catalog.

```
.
├── .opencode/
│   └── opencode.json                 # project config; loads the plugin
└── opencode-mistral-subscription/    # the plugin package (npm project)
    ├── src/
    │   ├── index.ts                  # Plugin.define entry: provider, integration, command
    │   ├── mistral-catalog.ts        # model overlay, unavailable list, fallbacks, variants
    │   └── mistral-oauth.ts          # PKCE browser sign-in: start, poll, exchange
    ├── tests/                        # node:test suites (hermetic)
    ├── package.json                  # scripts: test, typecheck, lint, secrets, check
    ├── tsconfig.json                 # NodeNext, strict, noEmit, allow .ts imports
    └── biome.json                    # formatter on, linter preset none
```

## Setup

Requires **Node.js >= 22.19.0** and **OpenCode V2**.

```sh
cd opencode-mistral-subscription
npm install --ignore-scripts
```

## Verify changes

Run the full gate before claiming work is done:

```sh
cd opencode-mistral-subscription
npm run check     # lint -> test -> typecheck -> secret scan
```

Individual steps: `npm run lint`, `npm run test`, `npm run typecheck`,
`npm run secrets`.

Tests are hermetic: `node:test` through `tsx`, OAuth tests inject a fake
`fetch`/`sleep`/`now`. **Never** add tests that hit Mistral or need real
credentials.

## Plugin loading

`.opencode/opencode.json` loads the plugin by relative path:

```json
{ "plugins": ["../opencode-mistral-subscription"] }
```

Paths in `plugins` resolve from the directory that holds the config file
(`.opencode/`), **not** the project root. A wrong path fails at load with
`ENOENT ... stat` and a `failed to load plugin` server log line — the plugin
code itself never runs.

The package resolves its entrypoint through `package.json` `exports`
(`"." -> "./src/index.ts"`), so no build step is needed; OpenCode loads the
TypeScript source directly. Config and plugin files are watched — save to
reload, or use `/reload` / `opencode service restart`.

## Conventions

- **TypeScript only, no build output.** Import local modules with explicit
  `.ts` extensions (`verbatimModuleSyntax` + `allowImportingTsExtensions`).
- **Tabs** for indentation; Biome formats and must pass `biome ci`.
- Type-only imports must use `import type` / inline `type`.
- Keep `src/index.ts` thin: registration and wiring. Catalog rules belong in
  `mistral-catalog.ts`, network/sign-in in `mistral-oauth.ts`.
- The plugin casts to `never` at SDK boundaries (`as never`) where the V2
  plugin types are narrower than the runtime shape. Keep those casts local and
  commented when non-obvious.
- Validate every URL returned by the sign-in API against the expected origin
  before using it (`validateUrlAgainstBaseUrl`).

## Credentials and secrets

- No API keys, tokens, or passwords in source, tests, docs, or commits.
  `npm run secrets` (secretlint) enforces this.
- The plugin never reads `MISTRAL_API_KEY`; the user's plain `mistral`
  provider stays untouched.
- Sign-in returns an API key stored as an OAuth credential in OpenCode's auth
  store (`access` = key, `refresh` = `mistral-browser-sign-in`). Do not log,
  print, or commit it. Redact credentials in any diagnostic output.
- Never paste real keys into issues, logs, or chat.

## Changing the model catalog

- `UNAVAILABLE_MODELS` lists models a subscription key cannot call. Add an
  entry with a comment naming the observed failure.
- `FALLBACK_MODELS` covers models missing from the host catalog;
  `ALWAYS_OFFERED` decides which fallbacks are injected.
- `adjust()` applies per-model overrides (context/output caps, reasoning
  levels, image input). Reasoning levels map to `#variant`s through
  `toVariants()`; `off` is sent as `reasoning_effort: "none"`.
- Update `tests/mistral-catalog.test.ts` and the README variant table
  whenever these lists change.

## Troubleshooting

Server logs: `~/.local/share/opencode/log/opencode.log` (filter
`role=server`). Look for `failed to load plugin` lines and their `cause`.

## Do not

- Do not commit `node_modules/`, `dist/`, or `*.tgz`.
- Do not add a bundler, transpiler, or test framework — the toolchain is
  intentionally `tsx` + `node:test`.
- Do not loosen `strict` or disable Biome rules to make a check pass.
- Do not edit `.opencode/opencode.json` paths without re-verifying the plugin
  loads (check the log).
