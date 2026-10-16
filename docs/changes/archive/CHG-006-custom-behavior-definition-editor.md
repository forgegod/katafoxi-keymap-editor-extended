# CHG-006 — Create and configure custom behavior definitions

**Status:** done
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-001
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P3 — larger authoring feature

## Current boundary

The fork has bounded staged definition authoring for hold-tap, sticky-key/layer, tap-dance, mod-morph and zero-cell sensor-rotate on Demo and verified Clipboard. Unsupported source remains read-only/preserved; GitHub/local definition authoring, arbitrary schemas and parameterized sensor adapters are not supported. [CAP-001](../../product/capabilities/CAP-001-firmware-keymap-editing.md) records the current implementation and its distinct core, component and browser evidence.

[Parity evidence](../upstream-gap-assessment.md) records the original gap. The frozen Phase 1 specification below is historical acceptance scope, not additional current capability or certification.

## Dependencies

CHG-005 establishes shared macro/reference validation; reuse that contract rather than creating a competing graph. If implemented earlier, explicitly resequence at a verified boundary.

## Acceptance criteria

- Create/configure supported hold-tap, sticky-key/layer, tap-dance, mod-morph and sensor-rotate definitions from a documented schema set; explicitly list unsupported properties/types rather than claiming all ZMK behaviors.
- Preserve labels, node names, binding-cell counts, reference typing and existing property values; name collisions, invalid bindings, recursion and reference-breaking deletion have actionable validation.
- Behavior configuration is global to references while key binding arguments stay per key/combo/sensor. Surface that distinction before Apply.
- Stock overrides and existing hold-tap controls/recipes remain compatible. Unsupported external behaviors remain opaque and byte-preserved instead of being normalized into the closest schema.
- Newly edited definitions round-trip with unrelated source intact, are undoable, and work through each shared save path.

## Owned implementation and evidence seams

- `packages/keymap-core/src/dts-behaviors.ts`
- `packages/keymap-core/src/behaviors.ts`
- `packages/keymap-core/src/types.ts`
- `packages/keymap-core/src/dts-behaviors.test.ts`
- `apps/web/src/lib/components/KeyEditor/HoldTapFields.svelte`
- `apps/web/src/lib/key-edit-session.svelte.ts`

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | done (`pnpm records:check` exits 0; corpus `fixture-roundtrip` 40 passed; final independent Grok review: no findings; specification and preservation fixtures only) | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | done (`pnpm --filter @keymap-editor/keymap-core test`: 1,096 passed, 1 skipped; `pnpm --filter @keymap-editor/web test`: 918 passed; `pnpm --filter @keymap-editor/keymap-core lint`, `pnpm records:check`, and `git diff --check` exit 0; final independent Grok review: no findings) | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | done (`pnpm --filter @keymap-editor/web test`: 954 passed; `pnpm test:e2e`: 54 passed; wireframes generated/rendered; `pnpm records:check` and `git diff --check` passed; final independent Grok review: no findings) | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | done (exact full gate exited 0; core 1,118 passed / 1 skipped, API 270, web 954, Cloudflare 11, record regressions 72 passed; browser 54, production 5, Pages 2 passed / 2 intentionally skipped; fresh independent Grok review: No findings on frozen SHA-256 `533e7eaebb69d3477914144b8d02a8bcbbaea5d1da10518f3b16bf263874a115`) | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Choose and pin the supported schema set and ownership model. Review upstream/ZMK schemas as requirements, not copied compiled app code.
2. Define reference validation, rename/delete semantics, stock override handling and which properties require raw/read-only fallback. Add fixtures covering each supported family and unsupported properties.

This section preserves the **Phase 1 proposal for Phase 2/3**. Phase 1 itself implemented no behavior-definition feature; its only executable artifacts were source-preservation fixtures. Later implementation evidence belongs to CAP-001 and the verified phase receipts, not these historical future-tense requirements.

### Pinned schema set (Phase 1 specification)

Pin the definitions to ZMK **v0.3.0**, commit `edf5c0814fd3ea202e43aad2d68fd32e882a518c` — the same baseline CHG-005 used, not the moving development documentation. This is a bounded editor subset, not a promise to compile arbitrary firmware.

Upstream inputs inspected as requirements (raw files at that commit, under `app/dts/bindings/behaviors/` and `app/dts/behaviors/`):

- [`zmk,behavior-hold-tap.yaml`](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/dts/bindings/behaviors/zmk,behavior-hold-tap.yaml) — `include: two_param.yaml`, required `bindings`, `flavor` enum.
- [`zmk,behavior-sticky-key.yaml`](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/dts/bindings/behaviors/zmk,behavior-sticky-key.yaml) — `include: one_param.yaml`, required `release-after-ms`, boolean flags.
- [`zmk,behavior-tap-dance.yaml`](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/dts/bindings/behaviors/zmk,behavior-tap-dance.yaml) and [`zmk,behavior-mod-morph.yaml`](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/dts/bindings/behaviors/zmk,behavior-mod-morph.yaml) — both `include: zero_param.yaml` with required `phandle-array` `bindings`; only mod-morph additionally requires `mods` and accepts optional `keep-mods`.
- [`zmk,behavior-sensor-rotate.yaml`](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/dts/bindings/behaviors/zmk,behavior-sensor-rotate.yaml) — `#sensor-binding-cells` `const: 0`, `tap-ms` default `5`.
- [`one_param.yaml` / `two_param.yaml` / `zero_param.yaml`](https://github.com/zmkfirmware/zmk/tree/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/dts/bindings/behaviors) and [`behavior-metadata.yaml`](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/dts/bindings/behaviors/behavior-metadata.yaml) — `#binding-cells` constants, deprecated `label`, `display-name`.
- [`app/dts/behaviors/sticky_key.dtsi`](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/dts/behaviors/sticky_key.dtsi) — stock `sk` and `sl` nodes: **there is no distinct sticky-layer compatible**; `sl` is a second `zmk,behavior-sticky-key` node whose child is `<&mo>` and that sets `quick-release`.

| Family | Editable compatible | Arity (cells) | Supported properties | Child bindings |
| --- | --- | --- | --- | --- |
| hold-tap | `zmk,behavior-hold-tap` | `#binding-cells = <2>` | `tapping-term-ms`, `quick-tap-ms`, `require-prior-idle-ms` (uint); `flavor` (enum) | `phandles`: exactly two bare references, e.g. `<&kp>, <&kp>`; no child argument cells |
| sticky-key | `zmk,behavior-sticky-key` | `#binding-cells = <1>` | `release-after-ms` (required uint); `quick-release`, `lazy`, `ignore-modifiers` (presence flags) | `phandles`: exactly one bare reference, e.g. `<&kp>`; no child argument cells |
| sticky-layer | `zmk,behavior-sticky-key` (same schema; child is a layer behavior, as stock `sl`) | `#binding-cells = <1>` | same as sticky-key | `phandles`: exactly one bare layer reference, e.g. `<&mo>`; no child argument cells |
| tap-dance | `zmk,behavior-tap-dance` | `#binding-cells = <0>` | `tapping-term-ms` (uint) | `phandle-array`: one or more complete invocations |
| mod-morph | `zmk,behavior-mod-morph` | `#binding-cells = <0>` | `mods` (required uint); `keep-mods` (uint) | `phandle-array`: exactly two complete invocations |
| sensor-rotate | `zmk,behavior-sensor-rotate` | `#sensor-binding-cells = <0>` (upstream `const: 0`) | `tap-ms` (uint) | `phandle-array`: exactly two complete invocations |

`flavor` enum is exactly `hold-preferred`, `balanced`, `tap-preferred`, `tap-unless-interrupted`. `mods` / `keep-mods` values are decimal integer literals in `<...>`; the editor does not synthesize the `(MOD_LSFT|MOD_RSFT)` expression form.

Supported property types are deliberately narrow: a **decimal non-negative `uint32`** in `<...>` (`0` is a value, not "absent"); a **string enum** for `flavor`; and **presence-only boolean flags** written as a bare `name;`. A missing optional property stays missing — the editor never materializes an upstream default. Property value edits reuse the hold-tap scalar patcher shape; no new writer, and shared `buildKeymapCode` remains the only writer.

### Ownership model and source-preservation preconditions

A definition is editable only when all of the following hold; otherwise it is recognized for preservation only and stays read-only:

- One uniquely labeled direct child of a unique `behaviors` container in one literal `/ { ... };` root. Label matches `[A-Za-z_][A-Za-z0-9_]*`; the DTS node name (which may contain hyphens) stays distinct from the label and is not an implicit reference.
- `compatible` in the pinned allowlist with the exact cell property (`#binding-cells`, or `#sensor-binding-cells` for sensor-rotate).
- Required properties present; every property name/value in the supported class (above); exactly the supported child-binding count and family-specific shape (bare phandles vs complete invocations).
- Closed-include source coverage: reuse `sourceCoverageComplete` and exactly the five `ALLOWED_INCLUDES` from `packages/keymap-core/src/zmk-macros.ts`: `<behaviors.dtsi>`, `<behaviors/macros.dtsi>`, `<dt-bindings/zmk/keys.h>`, `<dt-bindings/zmk/modifiers.h>`, and `<dt-bindings/zmk/bt.h>`. Allowed includes may be unused. Retain the existing symbols-require-header diagnostics for keys, modifiers and Bluetooth; allowing an unused header does not waive a required header for referenced symbols. No unmatched `#define`/`#undef`/include/conditional/overlay or unaccounted fragments.
- No `#if`/`#ifdef`/`#else` wrapping or sitting inside the node or its container.
- No collision with a declared label, a stock/control/reserved label, or an unresolved source reference; no duplicate label or node name.

Reuse the CHG-005 document-local **reference index** (`macroReferenceIndex`, `MacroReferenceSite` kinds and site paths) rather than a competing graph. Incoming-reference completeness is document-local under the closed-include assumption, not a repository-wide claim.

### Global definition vs per-invocation arguments

Definition properties are **global**: every `&label` site shares one set of tuning values. The site supplies only that definition's `#binding-cells` arguments, per key, combo or sensor slot — e.g. `&home_row LSHFT A` (two cells), `&sticky_nav 1` (one cell), `&tap_pair` / `&shift_pair` (zero cells). A `sensor-bindings` site references a sensor-rotate adapter with zero arguments. The editor must surface this distinction (global definition vs per-key arguments) **before Apply**, satisfying the acceptance criterion that a timing change affects every reference.

Hold-tap and sticky-key `bindings` contain bare child phandles, not complete invocations: hold-tap forwards its first/second invocation argument to the hold/tap child respectively; sticky-key (including sticky-layer) forwards its invocation argument to its sole child. Cells embedded in those `bindings` are unsupported. Tap-dance, mod-morph and sensor-rotate instead store complete child invocations in `phandle-array` bindings, with each child's required argument cells supplied there.

### Rename, delete, reference validation and cycle prevention

- **Rename:** only the label token changes, under complete coverage and **zero incoming references**; the DTS node name is retained. A new label must not collide with any declared/stock/reserved label or unresolved reference. No case folding or token repair.
- **Delete:** only a uniquely owned editable definition with zero incoming references and complete coverage; otherwise refuse and list the incoming sites or the coverage gap. No force-delete, no automatic caller rewrite, no substitution. Tapping-term/flag changes are not deletions.
- **Reference validation:** each complete invocation must have exactly the definition's declared cell count with operands valid for the referenced child slot domains (reusing macro operand-domain inference where a child is an ordinary behavior). For hold-tap/sticky-key bare child references, validate forwarded caller arguments against the child domains; do not require or accept argument cells inside their `bindings`. Unknown, excess or missing arguments, and opaque incoming sites, refuse an arity/signature change.
- **Cycle prevention:** build the same-file definition graph over child-bindings references and reject self- or mutual-recursive editable definitions (and any edit that would create a cycle), revalidating transitive callers. Cycles stay preserved/read-only, never auto-broken.
- **Stock overrides:** existing `&mt { ... }` / `&lt { ... }` timing blocks and the fixed `&rgblayer` recipe stay owned by their current contracts; CHG-006 must not normalize an override block into a named definition, must not convert the recipe, and must keep the existing hold-tap timing controls compatible. A named definition that collides with a stock/override label is read-only.

### Raw / read-only fallback and unsupported classes

Anything outside the subset above is preserved byte-for-byte and surfaced as read-only with an actionable reason — never normalized into the closest schema:

- unknown or `vendor,*` property, repeated property, child nodes inside a definition;
- expression / `#define` / hex / negative / non-decimal property values, and deprecated aliases `tapping_term_ms` / `quick_tap_ms`;
- hold-tap `global-quick-tap`, `hold-while-undecided`, `hold-while-undecided-linger`, `retro-tap`, `hold-trigger-key-positions`, `hold-trigger-on-release`; sensor-rotate deprecated `label`;
- compatible outside the allowlist (including `zmk,behavior-macro*`), mismatched/missing cells, missing required property, or incomplete root coverage;
- argument cells inside hold-tap/sticky-key (including sticky-layer) `bindings`, where only bare child phandles are supported;
- parameterized or unknown sensor-rotate adapters (`#sensor-binding-cells` other than `<0>`, or child count ≠ 2).

### Phase 1 fixtures (source preservation only)

Two corpus inputs were added and registered in the existing round-trip harness. They are **synthetic editor fixtures with generic names** (no concrete keyboard) and prove current source preservation through `buildKeymapCode` no-op and randomized key-edit locality — **not** behavior editability:

- `packages/keymap-core/fixtures/corpus/behavior-boundary-supported.keymap` — the six intended editable schemas under `behaviors` (`home-row` hold-tap, `sticky-shift` / `sticky-nav` sticky-key/sticky-layer, `tap-pair` tap-dance, `shift-pair` mod-morph, `dial-volume` sensor-rotate) plus key and encoder references. Manifest `warnings: []`, `expect: splice`.
- `packages/keymap-core/fixtures/corpus/behavior-boundary-opaque.keymap` — intentionally opaque/unsupported source: file-level `#define EXPR_TERM` and expression timing (`hold_tap_timing_unparsed`), mismatched cells, a missing required `release-after-ms`, an unknown property, a `(MOD_LSFT|MOD_RSFT)` mod expression, and a parameterized sensor adapter. Manifest `warnings: ["hold_tap_timing_unparsed"]`, `expect: splice`. The file-level define fails the closed-source coverage precondition for the entire file; this fixture is preservation-only, not evidence for isolated per-node class diagnostics. B11 requires Phase-2 coverage-clean variants without that define (and with the referenced closed includes) to isolate each class-specific reason.

Both are registered in `packages/keymap-core/fixtures/corpus/manifest.json`, which now lists 13 inputs (up from 11 before this phase); the corresponding corpus inventory bound in `src/fixture-roundtrip.test.ts` moved from 12 to 14. The fixtures belong to CHG-006; the existing `macro-boundary-*.keymap` ownership stays with CHG-005.

### Acceptance and future regression matrix

At Phase 1, all outcomes below were **proposed Phase 2/3 acceptance, not passing behavior tests**. Existing macro fixture ownership is unchanged; those fixtures did not widen any parser or UI in Phase 1. This matrix remains the original acceptance scope, not a claim that every cell has browser coverage.

| ID | Fixture / variation | Required future assertion and seam |
| --- | --- | --- |
| B01 | `behavior-boundary-supported.keymap`: parse identity of each of the six families. | Parse exact `compatible`, cells, label/node name, child count and properties; round-trip every family; a mismatched cell, unknown compatible or extra child yields a read-only diagnostic. New core behavior-definition parser tests. |
| B02 | Supported fixture property edits. | Edit `tapping-term-ms`/`quick-tap-ms`/`require-prior-idle-ms`/`tap-ms` (including `0`), mod-morph `mods` and optional `keep-mods` (each including `0` as a value), `flavor` enum, and add/remove `quick-release`/`lazy`/`ignore-modifiers`; `mods` is required so it always carries a value, while an absent optional `keep-mods` or flag stays absent and is never materialized; only the owned value/statement interval changes. Reuse the hold-tap scalar/flag patch seam. |
| B03 | `sticky-shift` (key child) vs `sticky-nav` (layer child); hold-tap/sticky variants with embedded child argument cells. | Both sticky nodes parse as `zmk,behavior-sticky-key`; `<&kp>` / `<&mo>` are bare child phandles receiving the caller's argument, not complete invocations. Hold-tap/sticky child bindings with argument cells are read-only/unsupported; the editor does not invent a sticky-layer compatible. |
| B04 | Key/combo/sensor sites referencing each definition. | Per-invocation cell counts and operand domains validated; missing/excess/unknown operands refuse; opaque incoming sites block arity changes. Reuse `validateMacroInvocation`-style checks. |
| B05 | Global-vs-per-invocation scope. | A property edit applies to the definition (all sites), while arguments stay per site; the UI surfaces this before Apply. Phase 3 web/session test. |
| B06 | Label vs node-name identity; label rename. | Rename changes only the label token under zero-reference/complete-coverage; node name retained; collisions with declared/stock/reserved labels refuse. |
| B07 | Delete preflight with incoming references. | Unreferenced, uniquely owned definition deletes; referenced or unproven targets refuse and list sites/reasons; source/model unchanged on refusal. Reuse `macroDeletePreflight` shape. |
| B08 | Typed reference validation. | Each invocation validates operand domains transitively; a signature change revalidates every caller. |
| B09 | Self/mutual cycle inputs added as Phase-2 test inputs (or a future dedicated fixture); the Phase-1 corpus contains no recursive definition. | Self- and mutual-recursive editable definitions refuse; cycles remain preserved/read-only; no repair. |
| B10 | Stock `&mt`/`&lt` override blocks and the fixed `&rgblayer` recipe. | Existing hold-tap timing controls and the recipe stay compatible; override blocks are never normalized into named definitions; a colliding named label is read-only. |
| B11 | Preserve `behavior-boundary-opaque.keymap` with its file-level coverage failure; add Phase-2 coverage-clean variants without `#define EXPR_TERM` to isolate each unsupported node/property class. | The original stays byte-identical and read-only under the file-level coverage refusal. Each isolated variant reports its class-specific actionable reason without normalization; the original fixture alone cannot prove per-node class diagnostics. |
| B12 | Save-path equivalence and persistence. | A source-backed edit requires matching source/fingerprint; JSON reload reconciles against the live revision; template/Demo boundary and undo/redo match the macro contract; shared `buildKeymapCode` remains the only writer. |

Phase 1 proposed these concrete Phase-2 regression cases: parse-and-identify each supported family from `behavior-boundary-supported.keymap`; reject embedded argument cells in hold-tap/sticky child bindings; a timing/flag/enum edit on one family with sibling-interval locality; a rename and a referenced-delete refusal; a stock `&mt` override coexistence check; and per-node class-specific read-only reasons using coverage-clean variants of the opaque input without `#define EXPR_TERM`, as required by B11. The original opaque fixture remains file-level refusal/preservation evidence only. The Phase-1 corpus has no recursive definition; later synthetic tests own cycle-refusal evidence. CAP-001 distinguishes the subsequent domain tests from Phase-3 interaction/visual evidence.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

## Phase 2 — Implement and prove the domain slice

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Extend shared behavior definition modeling/parse/splice and schema-driven validation. Reuse macro/reference traversal and integrate diff/clone/undo.
2. Test default/optional values, repeated references, arity, layer parameters, duplicate labels, unknown source and save-path equivalence.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the interaction and visual handoff

**Goal:** Make the new behavior usable and its canonical surface current.

1. Build behavior list/create/configure UI with scope notices, parameter-specific fields and reference-safe destructive actions.
2. Exercise create/bind/edit/cancel/export/reload, including combos and encoders. Update CAP-001 schematic or introduce a new current CAP with its own generated screen only at implementation.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

Required Phase 4 gate correction: remove the unused `ParsedKeymap` type import in `apps/web/src/lib/components/MacroPanel.svelte` reported by `pnpm lint`. This is behavior-neutral; no authoring boundary or earlier phase acceptance is expanded.

1. Update impacted CAPs and implementation/test links. Inspect every changed canonical HTML/PNG; validate Primary surface declarations. Add any new current CAP only alongside real behavior and proof.
2. Run the full integration gate below on the actual revision. Record exact commands/results, supported environment and remaining limitations. Retain any review package at its stable path and repair links.
3. Only then mark all phases done with evidence, mark the CHG done and move it to archive; update the change index. Do not commit/push/deploy without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` only for implemented CAP surfaces; render with `pnpm wireframes:render` and inspect the result. Before implementation, any optional proposal belongs in `docs/changes/reviews/CHG-006/` with a review-only README linked from this record. No proposal package exists or is required just to plan this change. Browser tests use synthetic fixtures and mocked GitHub, not real writes.

## Out of scope

- Automatic installation of external modules, arbitrary include-tree editing, all experimental ZMK schemas, firmware execution.

## Execution state

Phase 1 is complete: it specifies the bounded contract and adds source-preservation fixtures only. Three independent-review passes corrected the phandle versus phandle-array contract, opaque-fixture coverage limitations, the modifier-expression inventory, and the closed-include policy. The final authorized Phase-1 Grok review found no findings. Phase 2 is complete: it implements bounded behavior-definition parsing/splicing, shared reference validation, model/save integration, and domain regressions. Its final independent Grok review found no findings. Phase 3 is complete: the staged behavior-definition interaction, browser workflow, CAP and canonical schematic passed its gate and a final independent Grok review found no findings. Phase 4 is complete: the exact full gate passed and the operator confirmed a fresh independent Grok review returned No findings on the frozen candidate. Authorized record-only closure marks CHG-006 done and moves it to archive in the dedicated `chg-006-phase4` worktree. The archive candidate awaits final read-only review; no commit, primary-checkout integration, push or deployment is claimed or authorized.

- Final Phase 1 checks: `pnpm records:check` exited 0 (3 capabilities, 10 change records, wireframe manifest in sync); `pnpm --filter @keymap-editor/keymap-core exec vitest run src/fixture-roundtrip.test.ts` exited 0 (1 file, 40 tests passed); `git diff --check` passed. Node `v24.21.0`, pnpm `9.15.0`.
- Final independent review: authorized third fresh Grok review returned **No findings** after inspecting the complete candidate, including both untracked corpus fixtures. The tracked-path diff fingerprint was `0674d9f8efe8cad210bebb1a16fb7a42a26fe8b5cccee162ca5026441a9e0123`. No runtime, parser, UI, CAP or wireframe change.
- Final Phase 2 checks: `pnpm --filter @keymap-editor/keymap-core test` exited 0 (64 files, 1,096 passed, 1 skipped); `pnpm --filter @keymap-editor/web test` exited 0 (73 files, 918 passed); `pnpm --filter @keymap-editor/keymap-core lint`, `pnpm records:check`, and `git diff --check` exited 0. Node `v24.21.0`, pnpm `9.15.0`.
- Final Phase 2 independent review: fresh Grok review found **No findings** on full-diff SHA-256 `1dd2534901eb311009fa3e86e4e08796e4f8cc5a94f9a49015f5fda8a743ce59`; it confirmed the three corrected review findings and that the tree did not move during review.
- Phase 3 final verification: `pnpm --filter @keymap-editor/keymap-core test` passed (64 files, 1,118 passed, 1 skipped); `pnpm --filter @keymap-editor/web test` passed (74 files, 954 passed); `pnpm test:e2e` passed (54 tests); `pnpm wireframes:generate`, `pnpm wireframes:render`, `pnpm records:check`, and `git diff --check` passed. Canonical CAP-001 Behaviors states were inspected without clipping or overlap. Node `v24.21.0`, pnpm `9.15.0`.
- Phase 3 final independent review: fresh Grok review inspected the frozen corrected candidate against `98694ab` and returned **No findings**. It specifically rechecked source-free rename refusal, RGB/pinned-behavior layer operations, and absorbed hold-tap/preset deletion.
- Use Node 24 LTS and the repository-pinned pnpm; install Playwright Chromium for browser/render gates. If a started gate cannot run, keep the phase in-progress, mark the CHG blocked when appropriate, and record the actual blocker; never mark it done without evidence.

### Phase 4 final verification and reviewed closure

- Worktree: `chg-006-phase4`, based on `ead0ba010413d5e74afac287117557c3ea5a6150`; Node `v24.21.0`, pnpm `9.15.0`. The initial worktree was clean. `pnpm install --offline` exited 0, reusing 204 packages with zero downloads. Existing Playwright Chromium was sufficient.
- Fresh-worktree prerequisite: the first full gate stopped in API tests because the core package exports `dist/index.js`, which was absent. `pnpm --filter @keymap-editor/keymap-core build` exited 0. The second full gate passed all tests, then exposed the unused `ParsedKeymap` import; removing only that type import fixed lint. The third full gate passed tests/lint/build but tsx startup failed with `listen EINVAL` on a 130-byte Unix socket path. Shortening `TMPDIR` to the worktree's `node_modules/t` produced a 106-byte socket path; `pnpm --filter @keymap-editor/api exec tsx -e 'console.log("tsx IPC startup passed")'` exited 0. No product behavior changed to accommodate either environment issue.
- The exact full gate then exited 0: `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`. Core: 64 files, 1,118 passed / 1 optional local golden skipped; API: 13 files, 270 passed; web: 74 files, 954 passed; Cloudflare: 1 file, 11 passed; record-validator regressions: 72 passed. Lint: zero errors/warnings. Core/web/API builds passed; Vite reported its non-fatal chunk-size warning. Browser: 54 passed; production: 5 passed; static Pages: 2 passed / 2 GitHub-only checks intentionally skipped because GitHub is disabled. No live OAuth or deployment verification is claimed.
- Verification stayed local: `PAGES_TEST_URL` and `PAGES_EXPECT_GITHUB` were unset; fixture I/O used the worktree's `node_modules/.cache/chg-006-phase4/tmp/keymap-e2e`. No credentials, external writes, commit, push or deployment were used.
- Canonical generation and rendering succeeded for all 3 CAPs and produced no tracked visual changes. CAP-001 is still honestly `partial` / `human`; its bounded behavior and implementation/test links were checked against `BehaviorPanel.svelte`, `macro-editor.ts`, component/core tests and `e2e/behaviors.spec.ts`. No CAP claim needed expansion or correction. Full all-family browser acceptance and remote definition-authoring adapters remain outside its claims.
- CAP-001 HTML/PNG inspection: 1440×4900; all four Behaviors cards fit, with the final card ending at y=4414. The file-URL DOM check found no text outside those cards, no overflow, no page errors and no remote requests. Full-image inspection plus native-resolution crops `(20,3035)-(1420,3725)` and `(20,3710)-(1420,4455)` found no clipped text, overlapping controls or illegible labels. The visible states distinguish global definition properties, per-invocation arguments, whole existing encoder adapters, source-preview Apply, source restrictions and deletion/stale refusals. These are schematic checks, not runtime or firmware proof.
- Inspected artifact SHA-256: HTML `fdf601690c5873f9dad6d1319d0f7d5e152a873e27187d22ed6ed1ba85cbb8a8`; PNG `57d7296fb60466b941ff87472826d49fda3839b00e97b0a731e381f46d1bf8fc` (canonical CAP-001 paths linked from CAP-001).
- Final independent review: the operator confirmed a fresh Grok review returned **No findings** on frozen implementation-diff SHA-256 `533e7eaebb69d3477914144b8d02a8bcbbaea5d1da10518f3b16bf263874a115`. Before closure edits, `git diff --full-index` reproduced that exact fingerprint. This approval covers the frozen implementation candidate; the record-only archive candidate remains for final read-only review.
- DOX pass: root, docs, changes, product and wireframe contracts were re-read for closure and remain unchanged because this receipt and the existing active-to-archive lifecycle introduce no new behavior, ownership, durable structure or operating contract. `docs/changes/README.md` removes CHG-006 from Current records and lists it as done in Archive. CAPs, wireframes, product code and scope remain unchanged by closure; the reviewed import cleanup is preserved. No later phase is started, and no commit, push, deployment or primary-checkout edit is performed.
