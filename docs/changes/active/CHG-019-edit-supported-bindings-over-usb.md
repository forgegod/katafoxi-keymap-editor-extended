# CHG-019 — Edit supported bindings over USB

**Status:** in-progress
**External request:** Direct operator request: create the change records needed so this editor can change keyboard keys over USB without flashing, using the existing ZMK Studio RPC as the transport and `../zmkfirmware-zmk-studio/` as the reference client.
**Impacts:** CAP-001, CAP-002
**Baseline:** `ebc658622d3a5139bab9af0f71359e597ccee09e`

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Map a fake Studio session into an editor selection | done (`pnpm --filter @keymap-editor/keymap-core test -- src/studio-rpc-session.test.ts` exit 0 @ 3981b9752b8cae6100f5cd885e8992bc87fa09aa) | `pnpm --filter @keymap-editor/keymap-core test -- src/studio-rpc-session.test.ts` exits 0 |
| 2 | Connect USB from the source picker | done (`pnpm install --frozen-lockfile && pnpm --filter @keymap-editor/web test -- src/lib/usb-studio.test.ts` exit 0 @ 52b36c852eb52911c318fed4bfdb6e62f1614310) | `pnpm --filter @keymap-editor/web test -- src/lib/usb-studio.test.ts` exits 0 |
| 3 | Write one accepted binding and save keyboard settings | in-progress | `pnpm --filter @keymap-editor/web test -- src/lib/usb-studio-write.test.ts` exits 0 |
| 4 | Integrate current source records and visuals | pending | `pnpm records:check && pnpm wireframes:generate && pnpm wireframes:render && pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` exits 0 |

## Phase 1 — Map a fake Studio session into an editor selection

**Goal:** keymap-core can turn a fake Studio RPC session into an editor keyboard selection, and turn one editor binding back into a `setLayerBinding` payload, without opening a serial port.

1. Add a core session mapper that consumes the existing Studio response shapes used by `../zmkfirmware-zmk-studio/src/keyboard/Keyboard.tsx`: `behaviors.listAllBehaviors`, `behaviors.getBehaviorDetails`, `keymap.getPhysicalLayouts`, and `keymap.getKeymap`.
2. Require `core.getLockState` to be unlocked before keymap reads are accepted. A locked or missing session returns an explicit unavailable result, not an empty keymap.
3. Preserve behavior IDs and parameter integers. Do not invent aliases, host glyphs, or a `.keymap` file from the RPC payload.
4. Refuse payloads this client cannot represent: combos, conditional layers, encoder sensor bindings, macro definitions, and custom behavior definitions. Name the refusal; do not drop them silently into a successful selection.
5. Cover the mapper with `packages/keymap-core/src/studio-rpc-session.test.ts` using fixture responses. Do not open Web Serial and do not import the Studio React UI.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test -- src/studio-rpc-session.test.ts` exits 0.

## Phase 2 — Connect USB from the source picker

**Goal:** a supported browser can choose a USB keyboard, unlock it, and load the phase-1 selection. An unsupported browser keeps the existing Clipboard guidance.

1. Add a USB source beside Demo, Clipboard, Filesystem, GitHub, and Local. Extend `apps/web/src/lib/editor/types.ts` rather than overloading Filesystem or Local.
2. Use `@zmkfirmware/zmk-studio-ts-client` and its `transport/serial` entry, the same Web Serial path as `../zmkfirmware-zmk-studio/src/App.tsx` (`navigator.serial && serial_connect`). Do not vendor Studio's React screens, Tauri serial bridge, or BLE transport.
3. The picker starts the serial request from an explicit gesture. It shows locked, unlocked, disconnected, and unavailable states. `core.getDeviceInfo` identifies the connection; it is not a feature list.
4. Tests mock `navigator.serial` and the RPC client. A missing keyboard, denied picker, or disconnect leaves the accepted editor unchanged.
5. Do not write a `.keymap`, host snapshot, or GitHub commit from this source.

**Verification gate:** `pnpm --filter @keymap-editor/web test -- src/lib/usb-studio.test.ts` exits 0.

**Closeout evidence:** The first target gate at `52b36c852eb52911c318fed4bfdb6e62f1614310` exited 1 because the locked Studio client package was not installed in `node_modules`. `pnpm install --frozen-lockfile` left the lockfile unchanged, then the target gate exited 0 (83 files / 1,259 tests, then 2 files / 56 tests).

## Phase 3 — Write one accepted binding and save keyboard settings

**Goal:** an unlocked USB session can change one binding the keyboard already accepts, then save, discard, or restore stock settings, and the chrome says that write is not a repository save.

1. Send `keymap.setLayerBinding` only when `getBehaviorDetails` metadata accepts every supplied parameter. A validation failure stays on screen and does not advance the baseline.
2. `keymap.saveChanges` persists keyboard settings. `keymap.discardChanges` drops unsaved RPC edits. `core.resetSettings` is the explicit restore-stock action, matching `../zmkfirmware-zmk-studio/src/App.tsx`.
3. Chrome states that a successful save overrides the flashed keymap at that position until restore stock. It must not say the `.keymap` file, GitHub commit, or Clipboard copy was updated.
4. Dirty USB settings arm the existing leave warning. Disconnect does not pretend the last unsaved RPC edit was saved.
5. Cover save, discard, reset, metadata refusal, and disconnect with `apps/web/src/lib/usb-studio-write.test.ts`.

**Verification gate:** `pnpm --filter @keymap-editor/web test -- src/lib/usb-studio-write.test.ts` exits 0.

## Phase 4 — Integrate current source records and visuals

**Goal:** CAP-001 and CAP-002 describe only the USB behaviour proved by the tests, and their canonical schematics show the new source states.

1. Amend CAP-001 and CAP-002 in present tense. State the settings-versus-file boundary, the metadata refusal, and the mocked-browser limit. Do not claim a physical keyboard was certified.
2. Regenerate the canonical wireframes for those human-facing CAPs. The visual handoff is `pnpm wireframes:generate` and `pnpm wireframes:render`, then inspect the CAP-001 and CAP-002 HTML/PNG pair. Proposals do not go in `docs/product/wireframes/`.
3. Run the project record check and the core and web test gates.
4. Archive this CHG only after that integrated gate passes. Do not start CHG-020 from this phase.

**Verification gate:** `pnpm records:check && pnpm wireframes:generate && pnpm wireframes:render && pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` exits 0.

## Out of scope

- Embedding ZMK Studio's React or Tauri application.
- BLE, Web Bluetooth, and the Tauri serial bridge.
- `&uc` alias expansion and unicode metadata gating. That is CHG-020, and it depends on this CHG plus the unicode module's metadata change.
- Patching `zmkfirmware/zmk`, forking ZMK Studio, or changing `../keebart-zmk-config/config/west.yml`. The unicode pin is `forgegod/keebart-zmk-config` CHG-001.
- Treating `saveChanges` as a `.keymap` commit, host-layout publish, or firmware flash.
- Combos, conditional layers, encoders, macros, and custom behavior definitions over this RPC. Studio does not edit those, and this CHG must not pretend it does.
