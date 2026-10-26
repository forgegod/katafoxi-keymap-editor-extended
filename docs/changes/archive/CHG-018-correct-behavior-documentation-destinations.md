# CHG-018 — Correct behavior documentation destinations

**Status:** done
**External request:** Direct operator request: The documentation links introduced with CHG-017 are not correct, e.g. for "&trans" the documentation page is "https://zmk.dev/docs/keymaps/behaviors/misc#transparent" instead of "https://zmk.dev/docs/keymaps/behaviors/transparent". Verify all the links for existence and update the existing CHG-017 or create a new own with phased-plan-design skill
**Impacts:** CAP-001
**Baseline:** `ea1c301b40fb94bf433da934e24b8924b678bd12` on main

## Outcome and scope

Correct every evidenced broken behavior-help destination while preserving CHG-017's native-title, Ctrl/Meta-click, safe-window and no-edit contracts. This follow-up owns the two confirmed corrections, full destination-inventory evidence, offline regression coverage and CAP-001's matching canonical help schematic. Phase 1 corrected the two mappings; Phase 2 verified the integrated target and archived this completed follow-up.

[CHG-017](../archive/CHG-017-complete-behavior-documentation-help.md) is already archived. Preserve its phase evidence rather than reopen or reset it. Its baseline inventory explicitly did not certify live health of the pre-existing mappings, and its new tests retained the incorrect Transparent/None URLs. The two bad mappings predate that change; CHG-017's coverage did not discover them. This is a destination-correctness follow-up, not a replacement progress authority for the completed work.

## Live audit evidence

Read-only planning audit on 2026-10-26 at 06:35 UTC, against the baseline's complete `packages/keymap-core/src/zmk-docs.ts` URL inventory and the additional alternative reference in CHG-017:

- The resolver has 30 literal binding/preset mappings: the 28 built-in choices plus `&hm` and `&as`. Document-proven named hold-taps reuse the same hold-tap destination. Explicit RGB recipe context adds one destination outside that mapping object.
- Those paths emit 23 unique runtime destinations. All 23 were checked, plus CHG-017's unused Sensor Rotation alternative: 24 distinct audited URLs, with 22 HTTP 200 responses and two HTTP 404 responses.
- Each check used an HTTPS GET, followed redirects, and inspected returned page content. For all four fragment-bearing audited URLs, the decoded fragment matched an actual HTML `id` or named anchor. A successful page response alone was not treated as fragment proof. No redirect to a different page path was observed.
- Both proposed replacement URLs were then fetched separately: HTTP 200 for the Miscellaneous Behaviors page, with actual `transparent` and `none` IDs and body documentation for `&trans` and `&none`. These two replacement checks are additional to the 24-URL baseline audit.
- This is point-in-time documentation reachability evidence, not firmware-version, hardware or future upstream-availability certification. The application and automated behavior tests remain offline with respect to help destinations.

The table exhausts the audited inventory; repeated destinations are grouped by their consumers. “Anchor found” means the fragment was verified in the returned HTML, not merely accepted by the HTTP server.

| Consumer | Audited URL | Observed result |
| --- | --- | --- |
| `&kp` | https://zmk.dev/docs/keymaps/behaviors/key-press | HTTP 200 |
| `&kt` | https://zmk.dev/docs/keymaps/behaviors/key-toggle | HTTP 200 |
| `&inc_dec_kp` | https://zmk.dev/docs/features/encoders#rotation | HTTP 200; anchor found |
| `&uc` | https://github.com/urob/zmk-unicode/blob/main/README.md | HTTP 200; module README present |
| `&gresc` | https://zmk.dev/docs/keymaps/behaviors/mod-morph#behavior-binding | HTTP 200; anchor found |
| `&mkp`, `&msc`, `&mmv` | https://zmk.dev/docs/keymaps/behaviors/mouse-emulation | HTTP 200 |
| `&mt`, `&lt`, `&hm`, `&as`, proven named hold-taps | https://zmk.dev/docs/keymaps/behaviors/hold-tap | HTTP 200 |
| `&sk` | https://zmk.dev/docs/keymaps/behaviors/sticky-key | HTTP 200 |
| `&sl` | https://zmk.dev/docs/keymaps/behaviors/sticky-layer | HTTP 200 |
| `&mo`, `&to`, `&tog` | https://zmk.dev/docs/keymaps/behaviors/layers | HTTP 200 |
| `&caps_word` | https://zmk.dev/docs/keymaps/behaviors/caps-word | HTTP 200 |
| `&key_repeat` | https://zmk.dev/docs/keymaps/behaviors/key-repeat | HTTP 200 |
| `&bt` | https://zmk.dev/docs/keymaps/behaviors/bluetooth | HTTP 200 |
| `&out` | https://zmk.dev/docs/keymaps/behaviors/outputs | HTTP 200 |
| `&rgb_ug` | https://zmk.dev/docs/keymaps/behaviors/underglow | HTTP 200 |
| `&bl` | https://zmk.dev/docs/keymaps/behaviors/backlight | HTTP 200 |
| `&ext_power` | https://zmk.dev/docs/keymaps/behaviors/power | HTTP 200 |
| `&soft_off` | https://zmk.dev/docs/keymaps/behaviors/soft-off | HTTP 200 |
| `&sys_reset`, `&bootloader` | https://zmk.dev/docs/keymaps/behaviors/reset | HTTP 200 |
| `&studio_unlock` | https://zmk.dev/docs/keymaps/behaviors/studio-unlock | HTTP 200 |
| `&trans` | https://zmk.dev/docs/keymaps/behaviors/transparent | HTTP 404; correction required |
| `&none` | https://zmk.dev/docs/keymaps/behaviors/none | HTTP 404; correction required |
| Explicit Layer + RGB recipe help | https://zmk.dev/docs/keymaps/behaviors/macros#layer--underglow-color | HTTP 200; anchor found |
| CHG-017 alternative only; not emitted by resolver | https://zmk.dev/docs/keymaps/behaviors/sensor-rotate#variable-sensor-rotation | HTTP 200; anchor found |

### Selected corrections

| Binding | Verified replacement | Observed result |
| --- | --- | --- |
| `&trans` | https://zmk.dev/docs/keymaps/behaviors/misc#transparent | HTTP 200; `transparent` anchor found; Transparent documents `&trans` |
| `&none` | https://zmk.dev/docs/keymaps/behaviors/misc#none | HTTP 200; `none` anchor found; None documents `&none` |

All other destinations stay unchanged unless execution discovers a separately evidenced same-scope defect. Preserve the exact third-party README URL, the operator-selected Encoder Rotation reference, hold-tap family categorization and the RGB macro-pattern reference with its restore-black qualification.

## Acceptance criteria

- `zmkBehaviorDocsUrl` and `zmkBehaviorHelp` return the exact verified Miscellaneous Behaviors fragments for `&trans` and `&none`. Their help kind remains `binding`; catalog membership, parameter schemas and firmware semantics do not change.
- Every built-in choice, both hold-tap presets, document-proven named hold-taps and explicit RGB recipe help remain covered by the complete local destination inventory. Unknown, opaque/unproven and legacy `&reset` inputs remain unlinked.
- Offline core assertions reject the old `/transparent` and `/none` routes and retain the complete expected destination map. Do not mistake a test that repeats a source string for live-site validation; keep the researched page/anchor evidence distinct.
- Real Ctrl and Meta-click on both corrected chips opens exactly the full selected URL, including its fragment, with `_blank` and `noopener,noreferrer`. Help does not select, confirm, mutate bindings/source/definitions/colors, consume redo or create history. Ordinary selection and Apply/Cancel remain controls.
- CAP-001 describes the corrected current behavior only in the implementing slice. Its canonical help study includes both corrected binding references without inventing a custom tooltip or changing layout/interaction contracts.
- The final integrated revision passes the project gate and record validation. Live documentation checks remain an explicit maintenance audit, not an application request or a network-dependent unit/e2e gate.

## Owned boundaries and dependencies

- `packages/keymap-core/src/zmk-docs.ts` — the shared destination allowlist; do not scatter corrections in Svelte.
- `packages/keymap-core/src/zmk-docs.test.ts` — exact full-inventory URLs, categories, context and refusal controls. Existing expected URLs currently duplicate both bad routes.
- `apps/web/src/lib/components/KeyEditor/KeyEditor.test.ts` and `apps/web/src/lib/components/Keyboard/Keys/Key.test.ts` — extend existing modified-click and real-session seams for both corrected bindings.
- `e2e/clipboard.spec.ts` — real browser routing for both corrected parameterless chips, complete URL fragments, safe open arguments and unchanged draft/history/source. Reuse the existing help interception rather than navigate a remote site.
- [CAP-001](../../product/capabilities/CAP-001-firmware-keymap-editing.md) and `docs/product/wireframes/generate.mjs` — current help contract and canonical help study, with generated [HTML](../../product/wireframes/html/CAP-001-firmware-keymap-editing.html) and rendered [PNG](../../product/wireframes/exports/CAP-001-firmware-keymap-editing.png).
- This CHG and `docs/changes/README.md` — the sole active progress authority and its index. There are no other active CHGs or outstanding phase worktrees at planning baseline. Phase 2 depends on the verified Phase 1 slice.

Read the applicable DOX chain before each edit. These seams do not require changing every named product file. No new UI primitive, API boundary or architecture decision is needed. No separate review package is needed for this URL-only correction; do not place proposals in the canonical product inventory during planning.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Correct destinations with interaction and current-state evidence | done (`pnpm --filter @keymap-editor/keymap-core build && pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test && pnpm exec playwright test e2e/clipboard.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exit 0 @ d1a667f1067fd82ddb5f32e682bd47219d64a91f) | `pnpm --filter @keymap-editor/keymap-core build && pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test && pnpm exec playwright test e2e/clipboard.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 2 | Verify integrated documentation help and close the follow-up | done (`pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e` exit 0 @ 7993a4d28dbff98f6344d9de1504b98dfa0bfcce) | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e` |

## Phase 1 — Correct destinations with interaction and current-state evidence

**Goal:** Transparent and None open their existing upstream sections without editing the staged document, and tests/current-state records describe the corrected destinations.

1. Recheck the complete resolver inventory against the audited table, including preset/family and recipe paths. Fetch the two proposed replacements, confirm their page content and actual fragment IDs, and record any upstream drift without silently guessing a new route.
2. Add failing offline regressions for both corrected full URLs before editing the mappings. Retain all built-in destination assertions, semantic categories and unknown/legacy/context refusal controls. Confirm the focused failures are wrong-destination failures, not unrelated environment failures.
3. Correct only the two evidenced entries in the core mapping. Update the existing expected-URL inventory and extend the component, real-session and Clipboard browser help seams to cover both bindings with Ctrl and Meta, safe open arguments, unchanged staged/document/source/history state and ordinary selection/Apply/Cancel controls.
4. Update CAP-001 in this same slice, replacing the blanket unchanged-destinations wording with the bounded correction and precise test evidence. Keep live audit evidence separate from offline test claims.
5. Update CAP-001's canonical generator help study with Transparent and None references. Run `pnpm wireframes:generate && pnpm wireframes:render`, inspect the linked HTML/PNG and help study in light/dark at 1280×720 and 360×640, and verify the existing chip reachability/focus/scroll contract. Generated artifacts must come from the generator, not hand edits.
6. Run the phase gate and the repository-required independent review of the frozen implementation/evidence boundary. Review through the operator's prescribed live-session/model workflow or hand off the frozen evidence honestly if it cannot be controlled; do not claim an unavailable model switch or approval.

**Verification gate:** The phase-1 table command exits 0; observed live replacement checks confirm both IDs and binding content; corrected browser gestures preserve draft/history/source; CAP-001 and its inspected canonical HTML/PNG agree with the behavior. The test gate does not itself certify remote-site health. Do not archive this CHG in this phase.

## Phase 2 — Verify integrated documentation help and close the follow-up

**Goal:** The integrated target, complete destination inventory, CAP-001, canonical visuals and executable evidence agree about the bounded correction.

1. Re-audit every unique runtime destination and any fragment anchors on the integrated target, with the grouped inventory reconciled against actual emitted URLs. Record observation time, final response status/path and anchor results; transient network failures are blockers or explicitly unresolved observations, not a reason to invent a replacement. Keep the unused Sensor Rotation alternative distinguishable from runtime output.
2. Run the complete phase-2 gate using Node 24.21.0 and pnpm 9.15.0. Preserve failed attempts and distinguish environment bootstrap/retries from product fixes. CHG-017 documents a long-`TMPDIR` `tsx` socket limitation; resolve any recurrence with a verified short alias to authorized scratch rather than changing product code or bypassing checks.
3. Confirm CAP-001 retains `Primary surface: human`, exact binding/family/pattern boundaries and its canonical HTML/PNG links. Inspect regenerated help examples and representative real browser states; generation and record validation alone are not visual approval.
4. Complete the DOX pass, required independent implementation/evidence review and separate factual record review. Only after the integrated gate and audits pass, record the actual outcomes, archive this CHG and repair the change index. Preserve CHG-017's archived evidence.

**Verification gate:** The phase-2 table command exits 0 on the integrated target; the reconciled live audit has no unresolved runtime destination/anchor failures; current CAP-001, inspected visuals and behavior evidence agree. Only this final verified phase archives the follow-up.

## Phase 2 verification evidence

- On 2026-10-26, the unchanged integrated revision `7993a4d28dbff98f6344d9de1504b98dfa0bfcce` passed the full gate with Node 24.21.0 and pnpm 9.15.0: generation, rendering, record validation, workspace tests, lint, build and 144 browser tests all exited 0. The optional local core golden remained skipped because its git-ignored snapshot is absent.
- A fresh HTTPS audit reconciled the resolver's 30 literal mappings to 23 unique runtime destinations. All runtime responses were HTTP 200 without redirects; all five runtime fragments matched returned HTML IDs. The separate unused Sensor Rotation alternative also returned HTTP 200 with its verified anchor. Miscellaneous Behaviors documents both `&trans` and `&none` at their emitted fragments.
- CAP-001 retained `Primary surface: human`, corrected help boundaries and canonical HTML/PNG links. Regenerated canonical and representative browser help states were inspected in light/dark at 1280×720 and 360×640; no in-scope visual or interaction drift was found.
- An independent read-only review found no findings. This verification-only phase produced no implementation diff; the target and dedicated worktree remained clean at the verified revision.

## Out of scope

- Changing source parsing/splicing, catalog membership, binding parameters, firmware setup, Unicode mode/compatibility, RGB recipe semantics or definition-authoring permissions.
- Reopening or rewriting CHG-017's completed phase evidence, or treating its earlier offline assertions as live-link certification.
- Opportunistically replacing working page URLs with new deep links, changing operator-selected family/pattern references, or inventing help for unknown custom labels.
- A runtime link checker, network-dependent automated behavior tests, scheduled monitoring, a new tooltip/help UI or documentation-site deployment.
- Firmware/hardware execution, OS configuration, credentials, pushing or deployment. Planning-record commit authority does not start either implementation phase.
