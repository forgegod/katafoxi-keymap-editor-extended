# CHG-013 — Make Unicode input coexist safely with host layouts

**Status:** in-progress
**External request:** Direct operator request following maintainer feedback on [upstream PR #1](https://github.com/katafoxi/keymap-editor-extended/pull/1): keep `&uc` and host layouts available together, but make its English-layout runtime requirement explicit and verifiable from editor-managed host data.
**Impacts:** CAP-001
**Baseline:** `bb64d04119f8817b0cc0250178514af5b68ffd95`

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Establish a shared `&uc` host-layout compatibility contract | done (pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/keymap-core lint exit 0 @ 7c150bcf6265e5b8992152c4c51e6174fff5b409) | Focused keymap-core compatibility tests and lint exit 0 |
| 2 | Expose the bounded compatibility state in the Unicode picker | done (pnpm --filter @keymap-editor/web test && pnpm --filter @keymap-editor/web lint && pnpm exec playwright test e2e/unicode-picker.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check exit 0 @ 9bfafecd6dc666dfb99ee036de5b72307a07db2d) | `pnpm --filter @keymap-editor/web test && pnpm --filter @keymap-editor/web lint && pnpm exec playwright test e2e/unicode-picker.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 3 | Final integration and closure | in-progress | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e` exit 0; rendered CAP-001 schematic inspected |

## Phase 1 — Establish a shared `&uc` host-layout compatibility contract

**Goal:** The core can determine whether an editor-managed English host layout preserves the unshifted service characters required by `urob/zmk-unicode`.

1. Define one pure core result for the required unshifted digit, hexadecimal-letter, `U`, Space, and Enter outputs. It must report the missing or remapped service keys without altering a layout or a firmware binding.
2. Base the check on the selected English host-layout table, not a concrete keyboard, rendered glyphs, a national language column, or browser/OS detection.
3. Prove the standard US layout passes; changing any required base level fails; and Shift/AltGr changes on a digit position remain compatible.
4. Preserve source generation, `&uc` scalar/alias/mode encoding, host snapshots, and all host-layout editing behavior.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/keymap-core lint` exits 0.

## Phase 2 — Expose the bounded compatibility state in the Unicode picker

**Goal:** A person configuring `&uc` can see the compatibility result and the runtime limit without the editor claiming it can observe or change the operating system input state.

1. Obtain only the active English profile/table selected by the editor and pass its `unicodeHostLayoutCompatibility` core result as input through `KeyEditorHost` and `KeyEditor` into `UnicodePicker`; do not recreate compatibility logic in Svelte or mutate the result.
2. Render accessible English-only compatible, incompatible, and unavailable picker states. Explain that `&uc` requires a compatible English layout while active; a national layout may stay installed, but the editor cannot detect, select, or modify the operating system's active layout.
3. Keep incompatible and unavailable states warning-only: retain Unicode editing, Apply/Cancel behavior, source preservation, host layouts, firmware bindings, and no-op behavior. Do not repair host mappings, switch layouts, touch `west.yml`, `.conf`, or `default-mode`, detect host state, or change firmware/module setup.
4. Update CAP-001, `docs/unicode-picker.md`, and `docs/product/wireframes/generate.mjs`; regenerate the CAP-001 canonical HTML/PNG and inspect its rendered compatibility state. Record only proven present-tense behavior, implementation/behavior-test evidence, and links to both canonical artifacts from CAP-001.
5. Add focused component/session regressions for result propagation and every visible state, including accessibility text and compatible/incompatible/unavailable behavior. Update `e2e/unicode-picker.spec.ts` only to prove the changed visible picker state; do not claim OS or firmware runtime validation.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm --filter @keymap-editor/web lint && pnpm exec playwright test e2e/unicode-picker.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`

## Phase 3 — Final integration and closure

**Goal:** Verify the integrated Phase 2 vertical slice against the full project gate, preserve its evidence, and close CHG-013 without expanding its scope.

1. Recheck the integrated CAP-001, Unicode-picker documentation, canonical HTML/PNG, focused evidence, and browser workflow against the completed Phase 2 behavior; preserve factual Phase 1 and Phase 2 evidence.
2. Run the full product, record, visual, and browser gate and inspect the rendered CAP-001 schematic before closing the change.
3. Reconcile the external PR feedback as provenance without treating upstream review status as local implementation evidence. After the full gate passes, complete and archive the CHG through the record-closeout protocol, update its index entries, and rerun `pnpm records:check` against the archived state.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e` exits 0; inspect the rendered CAP-001 schematic.

## Out of scope

- Detecting, selecting, or modifying the operating system's active input layout.
- Treating a national host layout as an `&uc` service-layout substitute.
- Rewriting host base mappings or firmware bindings to make a layout compatible.
- Editing `west.yml`, module `default-mode`, `.conf`, or OS settings.
- Firmware compilation, flashing, or physical host-input validation.
- Replacing, rebasing, or coupling the upstream PR branch to local CHG execution.
