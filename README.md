# opencode-mistral

Workspace for the **`opencode-mistral-subscription`** OpenCode V2 plugin: a
`mistral-subscription` provider that signs in through Mistral AI Studio in the
browser and overlays the host `mistral` model catalog.

```
.
├── AGENTS.md                         # guidance for coding agents
├── .opencode/
│   └── opencode.json                 # project config; loads the plugin
└── opencode-mistral-subscription/    # the plugin package
    ├── src/
    │   ├── index.ts                  # Plugin.define entry: provider, integration, command
    │   ├── mistral-catalog.ts        # model overlay, unavailable list, fallbacks, variants
    │   └── mistral-oauth.ts          # PKCE browser sign-in: start, poll, exchange
    └── tests/                        # hermetic node:test suites
```

## Requirements

- OpenCode V2
- Node.js >= 22.19.0

## Use the plugin from this checkout

`.opencode/opencode.json` loads the plugin by relative path:

```jsonc
{
	"$schema": "https://opencode.ai/config.json",
	"plugins": ["../opencode-mistral-subscription"]
}
```

Paths in `plugins` resolve from the directory holding the config file
(`.opencode/`), not from the project root. OpenCode loads `src/index.ts`
directly through the package `exports` — no build step.

Install the package dependencies once:

```sh
cd opencode-mistral-subscription
npm install --ignore-scripts
```

Config and plugin files are watched: save to reload, or run `/reload`
(`opencode service restart` after a full stop).

## Sign in

```text
/connect
```

Choose **Mistral subscription**, then **Sign in with Mistral subscription**, and
finish the browser sign-in with a Mistral Pro or higher account. Then pick a
model:

```text
/models
# mistral-subscription/<id>
```

Reasoning effort is selected with `#variant`, e.g.
`mistral-subscription/zai-glm-5-3#high`. Your plain `mistral` provider and
`MISTRAL_API_KEY` usage are untouched. Run `/logout` or revoke the key in the
Mistral console to sign out.

See [`opencode-mistral-subscription/README.md`](opencode-mistral-subscription/README.md)
for the full model list, variants, and how the sign-in works.

## Development

```sh
cd opencode-mistral-subscription
npm run check     # lint -> test -> typecheck -> secret scan
```

Individual steps: `npm run lint`, `npm run test`, `npm run typecheck`,
`npm run secrets`. Tests are hermetic (`node:test` via `tsx`, fake `fetch`).

## Troubleshooting

Server logs live at `~/.local/share/opencode/log/opencode.log`; filter
`role=server` and look for `failed to load plugin` with its `cause`. A
`ENOENT ... stat` cause means the `plugins` path is wrong. Redact credentials
before sharing log excerpts.

## Licence

[MIT](opencode-mistral-subscription/LICENSE)
