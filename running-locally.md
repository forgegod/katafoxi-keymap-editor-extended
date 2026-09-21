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

If `keymap.json` is missing, Local mode loads bindings from the `.keymap` file automatically. **Save Local** writes both `keymap.json` and updates the `.keymap`. The LARK repo also has `host_keymap/` for later host-compose work.
4. Install [pnpm](https://pnpm.io/) (Node 20+), then run:

```bash
pnpm install
pnpm dev
```

5. Open `http://127.0.0.1:5173` (Vite UI). The API listens on `http://127.0.0.1:8080`.

Set `PORT` if the API port must change. Enable GitHub by setting `ENABLE_GITHUB=true` and filling the GitHub App fields in `.env`, plus matching `VITE_*` values in `apps/web/.env.development`.

## Using the editor

Your selected keyboard should load automatically when Source is **Local**. Click the top-left corner of a key to change its bind behaviour, or the middle to change the bind parameter.

Use the **ZMK code** / **Host composed preview** toggle to switch between firmware bindings and the LARK-style composed legend stub.

Click **Save Local** to write `keymap.json` and the `.keymap` file back into `zmk-config`.

[zmk-config-corne-demo]: https://github.com/nickcoutsos/zmk-config-corne-demo
