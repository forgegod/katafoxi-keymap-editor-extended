# CHG-013 — Make Unicode input coexist safely with host layouts

**Status:** planned
**External request:** Direct operator request following maintainer feedback on [upstream PR #1](https://github.com/katafoxi/keymap-editor-extended/pull/1): keep `&uc` and host layouts available together, but make its English-layout runtime requirement explicit and verifiable from editor-managed host data.
**Impacts:** CAP-001
**Baseline:** `bb64d04119f8817b0cc0250178514af5b68ffd95`

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Establish a shared `&uc` host-layout compatibility contract | pending | Focused keymap-core compatibility tests and lint exit 0 |
| 2 | Expose the bounded compatibility state in the Unicode picker | pending | Focused web component/session tests and web lint exit 0 |
| 3 | Integrate current product evidence and canonical visuals | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e` exit 0; rendered CAP-001 schematic inspected |

## Phase 1 — Establish a shared `&uc` host-layout compatibility contract

**Goal:** The core can determine whether an editor-managed English host layout preserves the unshifted service characters required by `urob/zmk-unicode`.

1. Define one pure core result for the required unshifted digit, hexadecimal-letter, `U`, Space, and Enter outputs. It must report the missing or remapped service keys without altering a layout or a firmware binding.
2. Base the check on the selected English host-layout table, not a concrete keyboard, rendered glyphs, a national language column, or browser/OS detection.
3. Prove the standard US layout passes; changing any required base level fails; and Shift/AltGr changes on a digit position remain compatible.
4. Preserve source generation, `&uc` scalar/alias/mode encoding, host snapshots, and all host-layout editing behavior.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/keymap-core lint` exits 0.

## Phase 2 — Expose the bounded compatibility state in the Unicode picker

**Goal:** A person configuring `&uc` can see the compatibility result and the runtime limit without the editor claiming it can observe or change the operating system input state.

1. Feed the selected editor-managed English layout's core result into the `&uc` picker.
2. State that `&uc` works only while the compatible English layout is active; a national layout may remain installed but does not satisfy the service sequence while active.
3. Keep the picker usable with a warning for an incompatible or unavailable editor-managed English layout. Do not silently rewrite base mappings, disable host layouts, switch the OS layout, change `west.yml`, or claim host-state detection.
4. Cover compatible and incompatible visible states, accessibility text, and existing Apply/Cancel/source-preserving behavior.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm --filter @keymap-editor/web lint` exits 0.

## Phase 3 — Integrate current product evidence and canonical visuals

**Goal:** The repository's current behaviour, user-facing prerequisite, and visual reference accurately describe the implemented compatibility boundary.

1. Update CAP-001, the Unicode picker documentation, and applicable target/architecture contract text only after the implementation and tests establish the final behaviour.
2. Update the CAP-001 canonical wireframe generator, render the matching HTML/PNG, and inspect the rendered compatibility state.
3. Reconcile the external PR feedback as provenance without treating upstream review status as local implementation evidence.
4. Run the full product, record, visual, and browser gates before closing the change.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e` exits 0; inspect the rendered CAP-001 schematic.

## Out of scope

- Detecting, selecting, or modifying the operating system's active input layout.
- Treating a national host layout as an `&uc` service-layout substitute.
- Rewriting host base mappings or firmware bindings to make a layout compatible.
- Editing `west.yml`, module `default-mode`, `.conf`, or OS settings.
- Firmware compilation, flashing, or physical host-input validation.
- Replacing, rebasing, or coupling the upstream PR branch to local CHG execution.
