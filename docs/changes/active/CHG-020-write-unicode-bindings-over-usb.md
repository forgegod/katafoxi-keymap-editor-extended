# CHG-020 — Write unicode bindings over USB

**Status:** in-progress
**External request:** Direct operator request: create the change records needed so this editor can change `&uc` keys over USB without flashing, after the keyboard's unicode behavior advertises parameters the existing Studio RPC will accept.
**Impacts:** CAP-001
**Baseline:** `ebc658622d3a5139bab9af0f71359e597ccee09e`

Depends on CHG-019 for the USB session and on `forgegod/urob-zmk-unicode` CHG-001 for firmware acceptance. This CHG can be proved with fake metadata. A fake-test pass is not proof that a flashed keyboard accepted the write.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Expand unicode aliases to two integers | in-progress | `pnpm --filter @keymap-editor/keymap-core test -- src/studio-unicode-binding.test.ts` exits 0 |
| 2 | Refuse a write the advertised metadata cannot accept | pending | `pnpm --filter @keymap-editor/keymap-core test -- src/studio-unicode-metadata.test.ts` exits 0 |
| 3 | Send an accepted unicode binding through the USB source | pending | `pnpm --filter @keymap-editor/web test -- src/lib/usb-unicode-write.test.ts` exits 0 |
| 4 | Integrate the unicode USB record and visual | pending | `pnpm records:check && pnpm wireframes:generate && pnpm wireframes:render && pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` exits 0 |

## Phase 1 — Expand unicode aliases to two integers

**Goal:** keymap-core expands a keymap `&uc` binding into the two integers the keyboard stores, before any RPC send.

1. Expand language aliases such as `UC_DE_AE` to the two code points already defined by the unicode module. Do not send the alias text.
2. Expand mode switches such as `UC_SET_LINUX` to `0xffffff` plus the mode index from `include/dt-bindings/zmk-unicode/uc.h` in the unicode module. Keep macOS at 0 and Emacs at 5.
3. Accept explicit `&uc 0xE4 0xC4` and `&uc 0xE4 0`. Reject values above `0x10FFFF`, surrogate code points, and a one-argument `&uc`.
4. Keep this expansion in keymap-core. The Svelte picker may display the alias; it must not be the only place that knows the integers.
5. Prove the cases in `packages/keymap-core/src/studio-unicode-binding.test.ts`.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test -- src/studio-unicode-binding.test.ts` exits 0.

## Phase 2 — Refuse a write the advertised metadata cannot accept

**Goal:** the client refuses an `&uc` write unless the connected behavior details contain a parameter set that accepts both integers.

1. Treat missing `.parameter_metadata` as incompatible. That is the current urob driver at baseline `6ce21267e497e20ff9e05da16d4eefcdd3e89190`.
2. Accept a code-point set only when both parameters allow the expanded integers, including `0` for the unshifted-only shortcut. Accept a mode switch only when the first parameter is the `0xffffff` sentinel and the second parameter is a mode index 0 through 5.
3. A HID-usage set does not become acceptable merely because the integers are in range. The refusal names the missing unicode set.
4. Do not add a new RPC or patch ZMK core to make this probe work.
5. Prove accept and refuse cases in `packages/keymap-core/src/studio-unicode-metadata.test.ts` with fixture `getBehaviorDetails` responses.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test -- src/studio-unicode-metadata.test.ts` exits 0.

## Phase 3 — Send an accepted unicode binding through the USB source

**Goal:** the USB source from CHG-019 sends an accepted `&uc` binding and blocks an unaccepted one without changing the repository file.

1. Require CHG-019's unlocked session. Do not open a second transport.
2. On apply, expand the binding, probe metadata, and send `keymap.setLayerBinding` only when phase 2 accepts it. Show the refusal in the existing editor chrome.
3. A successful fake save still displays the CHG-019 settings-override notice. It must not say the `.keymap` was published.
4. Tests use a fake connection. They must not require a flashed keyboard, a `west.yml` pin change, or a running ZMK Studio page.
5. Cover accepted send, metadata refusal, and unchanged file-save state in `apps/web/src/lib/usb-unicode-write.test.ts`.

**Verification gate:** `pnpm --filter @keymap-editor/web test -- src/lib/usb-unicode-write.test.ts` exits 0.

## Phase 4 — Integrate the unicode USB record and visual

**Goal:** CAP-001 describes unicode USB writes only to the extent the fake-session tests prove, including the firmware-metadata dependency.

1. Amend CAP-001 in present tense. State that a passing client test does not certify a connected keyboard, and that stock urob metadata absence remains a refusal.
2. Regenerate the CAP-001 canonical wireframe with `pnpm wireframes:generate` and `pnpm wireframes:render`. Inspect the HTML/PNG pair. Do not add a review package for this plan.
3. Run the record check and the core and web suites.
4. Archive this CHG only after that gate passes.

**Verification gate:** `pnpm records:check && pnpm wireframes:generate && pnpm wireframes:render && pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` exits 0.

## Out of scope

- Implementing the USB transport. That is CHG-019.
- Adding parameter metadata to the unicode driver. That belongs in `forgegod/urob-zmk-unicode`.
- Changing `../keebart-zmk-config/config/west.yml`, building firmware, or flashing either half. The pin is `forgegod/keebart-zmk-config` CHG-001.
- Detecting or switching the host OS unicode input mode.
- Rendering `&uc` inside ZMK Studio's own screen.
