# <img alt="Keymap Editor Icon" height="24px" src="./apps/web/public/editor-icon.png" /> Keymap Editor

Browser editor for ZMK keymaps. This fork
([katafoxi/keymap-editor-extended](https://github.com/katafoxi/keymap-editor-extended))
is a pnpm monorepo: Svelte 5 + Vite (`apps/web`), a thin Hono API (`apps/api`),
and shared ZMK logic (`packages/keymap-core`).

It is a fork of [nickcoutsos/keymap-editor](https://github.com/nickcoutsos/keymap-editor).
The upstream hosted app is [keymap-editor][Keymap Editor] with
[keymap-editor-demo-crkbd]. Upstream discussion:
[Talk to me!](https://github.com/nickcoutsos/keymap-editor/discussions).
For the original upstream feature list, see the
[upstream README](https://github.com/nickcoutsos/keymap-editor/blob/master/README.md).

## This tree

- Sources: **Demo** (bundled fixtures on first visit), **Clipboard** (paste
  `info.json` + `.keymap` / `keymap.json`, copy edited `.keymap` out), **Local**
  (dev adapter, sibling `zmk-config`), and **GitHub**.
- One key editor: behaviour, then the value list for that slot (keys, layers, modifiers, mouse commands). Enter applies a complete binding; Esc cancels.
- Composed host legends on the keycap; compact ZMK tokens (`L1`, `⌃`, `⇧⇪`, hold-tap pills) live in `keymap-core`.
- Undo/redo, a short **Draft** status, **Write files**, **Commit to GitHub**, **Copy .keymap** (Clipboard: text out for paste into your repo), and a **Latest** firmware chip on the GitHub source.
- Light / dark **theme** toggle (persisted in the browser; default dark).

Browser File System Access and combo/macro editors are upstream or planned. They are not in this tree. Vision: [docs/TARGET_SYSTEM.md](docs/TARGET_SYSTEM.md).

## Docs

- Run it: [running-locally.md](running-locally.md)
- Product vision: [docs/TARGET_SYSTEM.md](docs/TARGET_SYSTEM.md)
- Decisions: [docs/adr/](docs/adr/README.md)
- Agents: [AGENTS.md](AGENTS.md)

## Tests

`pnpm test` runs the Vitest suites in `keymap-core`, `apps/api`, and `apps/web`. `pnpm test:e2e` is a separate Chromium smoke against a temp copy of the LARK fixture; it does not write `zmk-config`. Details: [running-locally.md](running-locally.md#tests).

## License

MIT. The ZMK keycode list is taken from the ZMK documentation, also MIT.

[Keymap Editor]: https://nickcoutsos.github.io/keymap-editor/
[keymap-editor-demo-crkbd]: https://github.com/nickcoutsos/keymap-editor-demo-crkbd/
