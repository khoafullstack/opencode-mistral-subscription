# opencode-mistral-subscription

OpenCode plugin: Mistral subscription sign-in through Mistral AI Studio, as a
separate `mistral-subscription` provider. Written from scratch for OpenCode;
only the sign-in logic is modeled on
[pi-mistral-subscription](https://github.com/5omeOtherGuy/pi-mistral-subscription).

## Install

Requires OpenCode V2 and Node.js 22.19.0 or newer.

```jsonc title="opencode.jsonc"
{
	"$schema": "https://opencode.ai/config.json",
	"plugins": ["opencode-mistral-subscription"]
}
```

Or load from a local checkout (the path resolves from the config file's
directory, so from `.opencode/opencode.json` a sibling package is `../`):

```jsonc
{
	"plugins": ["../opencode-mistral-subscription"]
}
```

## Usage

```text
/connect
```

Choose **Mistral subscription**, then **Sign in with Mistral subscription**,
and complete the browser sign-in with your Mistral Pro or higher account.
OpenCode waits for the sign-in by itself (polls for ~60s).

Then pick a model:

```text
/models
# mistral-subscription/<id>
```

## What the sign-in does

The browser flow (`POST console.mistral.ai/api/vibe/sign-in` with a PKCE
challenge, poll, then exchange) returns a Mistral API key. The plugin stores
it as an OAuth credential in OpenCode's auth store (`access` = API key,
`refresh` = `mistral-browser-sign-in`, 10-year expiry like the Pi package).
Provider `mistral-subscription` sends requests to
`https://api.mistral.ai/v1` (native Mistral package) using that credential.
Your plain `mistral` provider and `MISTRAL_API_KEY` usage are untouched.

Run `/logout` (or revoke the key in the Mistral console) to sign out.

## Models

The provider overlays the host `mistral` catalog instead of shipping a fixed
list, so new models appear automatically:

- Filters out models a subscription key cannot call (`mistral-nemo`,
  `pixtral-large-latest`, old `devstral-*`, `mistral-large-2411`, …).
- Falls back to built-in definitions for `mistral-large-4`, `zai-glm-5-3`
  and `zai-glm-5-3-flash` when the host catalog lacks them.
- Caps Large 4 output at 32,768 tokens and enables image input for
  DeepSeek V4.1 Flash.
- Subscription usage counts against your plan's shared budget (Vibe Code
  usage), not as API billing.

## Reasoning effort

Pick an effort with `#variant`:

```text
mistral-subscription/zai-glm-5-3#high
```

| Model                                                                 | Variants                              |
| --------------------------------------------------------------------- | ------------------------------------- |
| `mistral-large-4`                                                     | `#low` `#medium` `#high`              |
| `zai-glm-5-3`, `zai-glm-5-3-flash`                                    | `#low` `#high` `#max`                 |
| `zai-glm-5-2`, `glm-5-2`                                              | `#off` `#minimal` … `#max`            |
| `deepseek-v4-1-flash-1017`                                            | `#off` `#low` `#high` `#xhigh` `#max` |
| `mistral-medium-3.5`, `mistral-medium-latest`, `mistral-small-latest` | `#off` `#high`                        |

`#off` sends `reasoning_effort: "none"`. No variant keeps the provider
default.

## Commands

- `/mistral-subscription-status` — how the sign-in is wired into OpenCode.

## Development

```sh
npm install --ignore-scripts
npm run check   # lint, tests, typecheck, secret scan
```

Tests are hermetic (`node:test` via `tsx`): OAuth tests inject a fake
`fetch`; no test contacts Mistral or uses real credentials.

## Licence

[MIT](LICENSE)
