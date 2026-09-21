# Running Locally

This tool helps edit keymap files in repositories already cloned onto your computer.

## Setup

1. Clone this repo and open the new directory in a terminal.
2. Copy `.env.template` to `.env`. Defaults are enough for local editing (GitHub optional).
3. Clone a `zmk-config` repo into this directory (or symlink it) so `zmk-config/config/info.json` and `keymap.json` exist.
4. Install [pnpm](https://pnpm.io/) (Node 20+), then run:

```bash
pnpm install
pnpm dev
```

5. Open `http://localhost:5173` (Vite UI). The API listens on `http://localhost:8080`.

Set `PORT` if the API port must change. Enable GitHub by setting `ENABLE_GITHUB=true` and filling the GitHub App fields in `.env`, plus matching `VITE_*` values in `apps/web/.env.development`.

## Using the editor

Your selected keyboard should load automatically when Source is **Local**. Click the top-left corner of a key to change its bind behaviour, or the middle to change the bind parameter.

Use the **ZMK code** / **Host composed preview** toggle to switch between firmware bindings and the LARK-style composed legend stub.

Click **Save Local** to write `keymap.json` and the `.keymap` file back into `zmk-config`.

[zmk-config-corne-demo]: https://github.com/nickcoutsos/zmk-config-corne-demo
