# Running Locally

This tool helps edit keymap files in repositories already cloned onto your computer.

## Setup

1. Clone this repo and open the new directory in a terminal.
2. Copy `.env.template` to `.env`. Defaults are enough for local editing (GitHub optional).
3. Point `zmk-config` at a firmware repo with `config/info.json` (and ideally `config/keymap.json`). For this project the LARK board works well:

```bash
# Windows (junction; no admin required)
cmd //c "mklink /J zmk-config C:\path\to\your\zmk-config"

# or Git Bash / Unix
ln -s ../zmk-keyboard-lark zmk-config
```

**Load:** Local mode prefers `config/keymap.json` when it exists and its `layers` are non-empty and valid. Otherwise it reads the raw `.keymap` (so a missing file, empty `layers`, or `layers: [[]]` all fall back). After the first **Save Local**, `keymap.json` is written and becomes the primary source on the next load (with expanded binds). `*.keymap.template` is never treated as the keymap file to overwrite. The LARK repo also has `host_keymap/` for later host-compose work.
4. Install [pnpm](https://pnpm.io/) (Node 20+), then run:

```bash
pnpm install
pnpm dev
```

5. Open `http://127.0.0.1:5173` (Vite UI). The API listens on `http://127.0.0.1:8080`.

### Local source (`ENABLE_LOCAL`)

For Source **Local** (`/layout`, `/keymap` sibling bridge):

- Set `ENABLE_LOCAL=true` in the repo root `.env`
- Set `VITE_ENABLE_LOCAL=true` in `apps/web/.env.development`

Both must be true; the API gates the routes, and the SPA hides Local unless the Vite flag is set. Default in `.env.template` is `ENABLE_LOCAL=false`.

### GitHub auth

- Enable GitHub with `ENABLE_GITHUB=true` and the GitHub App fields in `.env`, plus matching `VITE_*` values in `apps/web/.env.development`.
- Login uses an HttpOnly session cookie (`sid`). The browser never gets a GitHub OAuth access token, and there is no `?token=` on the redirect after OAuth.
- In dev, `GITHUB_OAUTH_CALLBACK_URL` must be the **Vite** origin (e.g. `http://127.0.0.1:5173/github/authorize`), not `:8080`, so `Set-Cookie` attaches via the Vite proxy. Production uses same-origin `{APP_BASE_URL}/github/authorize`.
- Decision record: [docs/adr/0003-github-auth-server-session.md](docs/adr/0003-github-auth-server-session.md).

Set `PORT` if the API port must change. Set `APP_BASE_URL` to the browser-facing app origin.

## Using the editor

Your selected keyboard should load automatically when Source is **Local**. Click the top-left corner of a key to change its bind behaviour, or the middle to change the bind parameter.

Use the **ZMK code** / **Host composed** toggle to switch between firmware bindings and the LARK-style composed legend stub.

Click **Save Local** to write `keymap.json` and update the `.keymap` in `zmk-config`. Save path depends on what is already on disk:

1. If `config/*.keymap.template` exists, that template fully controls the written `.keymap` (`{{rendered_layers}}` / `{{behaviour_includes}}`).
2. Otherwise, if a `.keymap` already exists, Save splices bindings only inside `keymap { compatible = "zmk,keymap"; }`. `#define`, `#include`, and `&mt` / `&lt` blocks outside those bindings stay.
3. If there is no template and no original `.keymap` text, Save uses the default generated template and the API returns a warning (not the LARK path).

Import from `.keymap` expands simple `#define` aliases (`VU` → `C_VOL_UP`, `BT1` → `BT_SEL 1`). After Save, bindings are the expanded tokens, so `#define` lines can be left unused; the editor warns when that happens (no reverse substitution). Decision record: [docs/adr/0002-keymap-file-contract.md](docs/adr/0002-keymap-file-contract.md).

Do not commit a Save into the LARK firmware repo (`zmk-keyboard-lark`) without reviewing `git diff` on the `.keymap` (and `keymap.json` if it appears).

[zmk-config-corne-demo]: https://github.com/nickcoutsos/zmk-config-corne-demo
