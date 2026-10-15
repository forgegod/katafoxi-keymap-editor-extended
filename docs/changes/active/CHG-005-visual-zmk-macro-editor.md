# CHG-005 — Author ZMK macros visually

**Status:** in-progress
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-001
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P3 — larger authoring feature

## Current boundary

The fork preserves existing macro source and provides a fixed rgblayer recipe. It does not model or author arbitrary ZMK macro sequences. C #define expansion is a distinct existing parser feature.

[Parity evidence](../upstream-gap-assessment.md). These are requested outcomes, not present capability claims.

## Dependencies

Coordinate layer-reference semantics with CHG-003. Establish a shared behavior-reference contract for CHG-006; this record owns macro sequences, not general behavior schemas.

## Acceptance criteria

- Create, name, edit and safely delete supported macro definitions; bind them to keys, combos and compatible sensor slots with correctly typed arguments. Warn/block deletion when referenced.
- Support ordered press/release/tap/wait controls, tap-ms and wait-ms including zero, and one-/two-parameter forwarding with appropriate binding-cells and compatible values.
- Validate repeated placeholders, missing/extra arguments and command behaviors with additional parameters. Preserve unsupported/ambiguous constructs unchanged and show why they cannot be edited.
- Generate a typing sequence from text under an explicit supported keycode/host-layout mapping; do not silently map unsupported Unicode to incorrect keys.
- No-op load/save is byte-preserving for unedited macro nodes; edits change only owned intervals. Existing fixed recipes, opaque bindings, comments and includes survive.

## Owned implementation and evidence seams

- `packages/keymap-core/src/types.ts`
- `packages/keymap-core/src/behavior-recipes.ts`
- `packages/keymap-core/src/dts-scan.ts`
- `packages/keymap-core/src/dts-splice.ts`
- `packages/keymap-core/src/custom-bindings.test.ts`
- `packages/keymap-core/src/fixture-roundtrip.test.ts`
- `apps/web/src/lib/components/KeyEditor/KeyEditor.svelte`

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | done (`pnpm records:check`; focused core: 120 passed; Grok re-review: no findings) | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | pending | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Define a bounded macro model and supported ZMK schema baseline. Reconcile named behavior references, parameter typing and layer references without requiring a wholesale DTS AST rewrite.
2. Add fixtures for existing macros, repeated forwarding, zero delays, bracket/brace typing, nested references, unsupported source and reference-safe deletion. Decide text-to-key mapping limits.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

### Proposed schema baseline (not implemented)

Pin macro semantics to ZMK **v0.3.0**, commit `edf5c0814fd3ea202e43aad2d68fd32e882a518c`, not the moving development documentation. This is an editor subset, not a promise to compile arbitrary v0.3 firmware or a downgrade of the existing stock catalog. Inspected upstream inputs:

- [Macro schemas and their zero/one/two-param and macro_base includes](https://github.com/zmkfirmware/zmk/tree/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/dts/bindings/behaviors).
- [Control labels and MACRO_PLACEHOLDER](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/dts/behaviors/macros.dtsi) and [runtime forwarding/queue/release semantics](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/src/behaviors/behavior_macro.c).
- [Queue capacity and macro timing configuration defaults](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/Kconfig).
- [Bluetooth source-token expansion](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/include/dt-bindings/zmk/bt.h), [sensor-rotate schema](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/dts/bindings/behaviors/zmk,behavior-sensor-rotate.yaml) and [sensor-rotate implementation](https://github.com/zmkfirmware/zmk/blob/edf5c0814fd3ea202e43aad2d68fd32e882a518c/app/src/behaviors/behavior_sensor_rotate.c).

Model a definition separately from its invocations: stable source identity, reference label, DTS node name, compatible/arity, optional initial timing, ordered controls/invocations, and eligibility diagnostics. Keep source revision/ranges separate from serializable semantic data; offsets are never valid against a different revision. This describes responsibilities, not pre-existing TypeScript symbols.

| Contract | Editable subset | Preserve opaque / reject proposed edit |
| --- | --- | --- |
| Definition | One uniquely labeled direct child of a unique root `macros` or `behaviors` container, in one literal `/ { ... };` root. Labels match `[A-Za-z_][A-Za-z0-9_]*`; node names may contain hyphens and remain distinct from labels. New definitions use `macros`. | Missing/duplicate labels, repeated containers/node names, overlays, multiple roots, child nodes, disabled/unknown status, convenience `ZMK_MACRO*` calls or conditional declarations. A node name is not an implicit phandle label. |
| Schema | Exact pairs: `zmk,behavior-macro` / `0`, `zmk,behavior-macro-one-param` / `1`, `zmk,behavior-macro-two-param` / `2`. Required `bindings`; optional `tap-ms`, `wait-ms`, literal `label` and `display-name` metadata. | Mismatched/missing cells or compatible, duplicate properties, unknown properties, expressions/aliases in structural fields. Do not retain only the understood portion as editable. |
| Timing | Non-negative decimal uint32 literals, including `0`; absence stays absent, not silently materialized. Press starts from initial `tap-ms` / `wait-ms`, or the corresponding ZMK configuration defaults when absent. Release timing starts at zero; only before-pause timing controls change its precomputed baseline. Post-pause controls then apply in order. | Negative/fractional/out-of-range values, hex/expression timing, missing/extra control arguments. Wait time sets a delay after subsequent behavior events; there is no invented standalone sleep control. |
| Sequence | Ordered non-empty phandle list, one or more `<...>` groups separated by commas, possibly multiple bindings per group. Controls: tap/press/release, tap_time/wait_time, at most one pause_for_release, and four param forwarding controls. Preserve redundant controls and grouping on no-op. | Trailing scraps, unbalanced delimiters, empty groups, unknown controls, multiple pauses, more than 256 phandle entries. An invalid imported sequence stays whole and read-only; do not salvage a prefix. |
| Ordinary invocations | Explicit initial leaf allowlist: `&kp`, `&kt` (catalog keycode/modifier wrappers); `&mo`, `&to`, `&tog`, `&sl` (layer); `&mt` (modifier, code); `&lt` (layer, code); `&none`, `&trans` (zero args). Also the Bluetooth subset below and verified same-file macros. | Other catalog entries are not automatically macro-editable. External behaviors, arbitrary function expressions, unsupported custom definitions and overridden stock dependencies remain opaque. General hold-tap/custom schemas belong to CHG-006. |
| Command cells | `&bt BT_SEL n` and `&bt BT_DISC n` require a profile argument from the existing catalog's `0`–`4` set. `&bt BT_CLR`, `BT_CLR_ALL`, `BT_NXT`, `BT_PRV` have no explicit extra source argument; each alias supplies a second firmware cell of zero. | Missing/extra arguments; unknown selector; forwarding into the selector or an implicit alias-supplied cell. Catalog source arity is not DTS cell count. No generic preprocessor: the listed aliases are an explicit baseline table. `RGB_COLOR_HSB(...)` stays opaque to general macro editing; the existing rgblayer recipe remains separately owned. |

For invocation values, use catalog-backed keycodes/modifier wrappers and bounded decimal layer indices; no numeric guessing from opaque tokens. Validate each operand after forwarding substitution. A forwarded cell may use `MACRO_PLACEHOLDER`, `0` or another supported single-cell literal because firmware replaces it; a non-forwarded placeholder is just zero, not a parameter declaration, and must meet the ordinary operand's validation. Preserve the original filler on no-op. New forwarded cells use `MACRO_PLACEHOLDER` only with the verified stock macro header. An unused declared input has no inferred type and makes the definition read-only in this initial subset.

Forwarding is a one-shot state per destination cell. Controls do not consume it; the next ordinary invocation consumes and resets both cells. Support all four controls: `1to1`, `1to2`, `2to1`, and `2to2`. `1to1` and `1to2` may forward the same macro input to both child cells; repeated occurrences in later invocations require repeated controls. A repeated control for the same destination has firmware last-write-wins semantics: retain the controls, infer constraints only from the effective assignment. A nonexistent source input, nonexistent effective target cell, or dangling assignment at the end refuses authoring. An assignment crosses the single pause only if unconsumed at the pause; an ordinary invocation before the pause consumes it. Release processing applies post-pause controls before the first release invocation, so a carried assignment may be overwritten before use. Validate and infer constraints from the effective assignments at each ordinary invocation, not directly from the carried state at the pause.

Press begins in tap mode with each initial timing property, or its corresponding ZMK configuration default when absent. The pinned implementation precomputes release state separately: it begins in tap mode with `tap_ms = 0` and `wait_ms = 0`, then applies before-pause mode/timing controls in order (ordinary invocations reset forwarding, not timing). Initial timing properties do not seed release timing. After the pause, mode/timing and forwarding controls apply in order before subsequent release-side invocations. No host execution or firmware simulator is promised.

Infer an input's domain from **all** effective uses, transitively through an acyclic same-file macro graph, not the first placeholder. Same-kind domains intersect (including enum/range restrictions); incompatible kinds such as layer versus code refuse even when a numeric value could inhabit both. Distinct keycode and modifier constraints intersect only through explicitly known modifier keycodes. Command-dependent operand domains require a fixed supported selector; forwarding a selector is outside this slice. Detect self/mutual cycles, unresolved callees and transitive opaque dependencies before registering an editable signature. Changing a definition revalidates every caller; incompatible arity/type changes are blocked, never padded/truncated or silently propagated. An opaque incoming site blocks a signature change because its arguments cannot be proven compatible.

### Reference ownership and operation safety

Core owns one document-local reference index, consumed by macro validation, deletion preflight and later CHG-006 work. Entries distinguish definition identity/provenance, invocation sites, typed operand slots, and conservative raw reference evidence. Site paths identify layer/key, combo, macro step, hold-tap child, sensor adapter direction, or opaque source interval. UI catalog membership or stored `params` hints never prove a definition. Include order does not grant local ownership; duplicate labels and stock/control replacements invalidate dependent schema proof regardless of declaration order.

- Resolve built-ins only under a closed include policy: `<behaviors.dtsi>` (or the directly needed `<behaviors/macros.dtsi>` for controls), and the relevant `<dt-bindings/zmk/keys.h>`, `<dt-bindings/zmk/modifiers.h>`, `<dt-bindings/zmk/bt.h>` headers. No fetching or evaluating included files. Other includes/local `#define`/`#undef`, conditional directives, overlays, `/delete-*` or unaccounted top-level fragments prevent a complete authoring/reference proof. Imported source still follows existing ordinary-save rules; preservation is not proof of editability.
- Keys and combos take a fully validated macro invocation with its exact input count. Named hold-tap child references are incoming references for deletion; this phase does not expand hold-tap authoring to accept new macro children.
- **Sensor compatibility is not inferred from arity.** A macro has ordinary press/release callbacks, not sensor callbacks. Never emit `sensor-bindings = <&my_macro ...>` or place a macro phandle in an `&inc_dec_kp` keycode argument. Compatible destinations are only the two ordinary child bindings of an existing, uniquely owned `zmk,behavior-sensor-rotate` adapter: `#sensor-binding-cells = <0>`, exactly two complete child invocations, optional decimal `tap-ms` and literal metadata, no other properties/overrides. The layer refers to that adapter with zero arguments. CHG-005 may replace a child invocation's owned interval with a validated macro call, affecting every layer using that adapter; it cannot create/configure adapters. CHG-006 owns general sensor-rotate definitions. Unknown/parameterized adapters remain opaque.
- Scan the whole supplied source for exact phandle tokens outside comments/strings, including opaque nodes and definitions not otherwise modeled. Those tokens count as incoming references even without a typed edge; never substring-match `&name_suffix` as `&name`. Inspect preprocessor text separately: unknown expansion/include effects mean reference completeness is unknown, not zero references. Comments and quoted display text mentioning `&name` are not references.
- Completeness is document-local under the closed stock-include assumption, not a repository-wide assertion about other files that might include this keymap. Within that boundary, opaque sibling nodes with fully scanned literal properties can contribute raw reference edges without becoming editable. Unbalanced syntax, symbolic reference construction or unconsumed fragments make coverage incomplete and refuse structural macro operations. Recognizing a supported node alone does not authorize a mutation in an unproven document.
- Delete only a uniquely owned editable definition with **zero incoming references and complete reference coverage**. Otherwise block and list sites or the coverage gap; no force-delete, automatic caller deletion, or transparent substitution. A label rename uses the same zero-reference/complete-coverage gate; referenced labels stay stable. Display-name metadata can change without retargeting calls; DTS node names are retained. New labels must not collide with any declared label, known stock/control/recipe label or unresolved source reference. No case folding or token repair.
- Macro argument typing includes layer references but does not relax CHG-003 preflight. Reorder/duplicate remain refused for general macro source until the layer-operation checker explicitly proves the entire source graph. When admitted, remap only proven literal layer operands and forwarded layer inputs across all callers, never delays/profile numbers/fillers. Layer deletion must likewise refuse when macro-held layer targets cannot be safely transformed; the legacy helper is not a declaration-aware proof. Phase 2 must test this integration without a new generic layer engine.
- Reserve `&rgblayer` for the existing fixed recipe. Do not auto-convert it to a general macro, rewrite its body, or insert a duplicate under `macros`. Retain existing insert-if-missing behavior. A conflicting/noncanonical declaration cannot gain an editable general signature or authorize layer operations.

### Source intervals and persistence boundary

Use the existing `scanDts` masking/brace index and child-node ranges with a small macro property/group reader. `findAngleProp` and the layer binding tokenizer alone do not prove a complete comma-separated macro `bindings` property. Require full consumption and balanced groups, with parentheses handled before splitting cells; keep original source and semantic fingerprint together. This is bounded scanning, not a general DTS AST or C expansion service.

1. No-op or unrelated key edits preserve every macro node byte-for-byte, supported or opaque, including comments, metadata, grouping, whitespace and LF/CRLF. The existing ADR 0002 alias-expansion exception concerns layer binding intervals; it is not permission to normalize macro bodies. If source cannot be safely spliced, reject instead of regenerating.
2. A timing/metadata edit owns only that property's value, or an insertion/removal span for an absent/removed property. A sequence edit owns the `bindings` value (not the node/container); preserve comments inside it with anchored token edits, or refuse an edit whose comment attachment cannot be retained. A macro edit never owns adjacent definitions, preamble or unrelated properties. New nodes insert at a verified container boundary (create `macros` only in a proven root); deletion cuts the exact node from label through semicolon, not preceding/following comments. Label rename changes only that label token under the gate above.
3. Prepare all non-overlapping edits against one captured revision, apply in descending order, reparse and revalidate; a mismatch, overlap, stale baseline or refusal leaves both model and source untouched. A compatible sensor child edit owns only its child binding span. An invocation edit in a key/combo follows that editor's existing owned interval contract; do not broaden it to surrounding macro definitions.
4. Phase 2 must carry semantic definitions through encode/parse, JSON validation, clone/diff, history and recovery without serializing transient source offsets. Missing macro metadata in legacy JSON means **unmanaged/preserve source**, never delete all; an explicit empty managed list removes only known owned baseline definitions after deletion preflight, never opaque nodes. JSON-first reload must reconcile macro metadata against the actual source revision before edits; disagreement disables macro authoring instead of choosing one side silently. Validated definition metadata can authorize its own references, not arbitrary unknown JSON labels.
5. Shared `buildKeymapCode` remains the only writer. A source-backed macro mutation requires its matching source; a template-selected save cannot accept it, since the template outranks the splice. Template/no-source imports remain preservation/read-only for this feature. Positively source-free Demo/new documents may generate only newly managed definitions through the default template. No missing-source fallback for imported definitions, include repair, firmware/config edits, or adapter-specific serializer. Keep ordinary unchanged save behavior intact.

### Text-to-key boundary

The first generator is an explicit **US QWERTY / ASCII** mapping, independent of the active Host legend language. Require the user to choose/acknowledge that mapping and preview the sequence; never infer it from glyph columns, OS, locale or a Unicode alias. Map printable ASCII U+0020–U+007E plus LF and TAB only: lowercase to `&kp A`…`Z`, uppercase to `&kp LS(A)`…`LS(Z)`, US digits/punctuation via a fixed core table, LF to `&kp ENTER`, TAB to `&kp TAB`. In particular the characters `[`, `]`, `{`, `}`, backslash and vertical bar map to `LBKT`, `RBKT`, `LS(LBKT)`, `LS(RBKT)`, `BSLH`, `LS(BSLH)` respectively. Spaces and repeated characters are not trimmed/collapsed. Empty input proposes no change. CR (including CRLF), other controls, DEL, combining marks, emoji, non-ASCII letters and lone surrogates reject the entire conversion with positions/code points; no normalization, substitution, dropped characters or partial Apply.

Generate a new zero-parameter tap sequence, not an append into unknown press/release state. Propose explicit `tap-ms = <40>` and `wait-ms = <40>` (not a guaranteed transport timing); timing remains user-editable including zero. A 32-character sequence can require 64 queue entries (one press and one release per tap), filling the pinned default `CONFIG_ZMK_BEHAVIORS_QUEUE_SIZE = 64` with no margin for concurrent activity. Bound generation to 24 mapped characters / 48 queue entries, reserving 16 entries against that default for concurrent activity. This margin is not a runtime safety guarantee: concurrent activity can exceed it, nested macros add work, and firmware configuration, Caps Lock/modifiers and the host can still affect output. Reject over-limit input atomically. General sequence editing retains the 256-entry bound and warns when a known press/release segment exceeds the 48-entry budget, including when it fills or exceeds the default 64-entry queue; no claim of a firmware-safe runtime estimate for nested invocations. No OS Unicode sequences, compose/dead-key/AltGr inference, layout registry inversion or `&uc` synthesis in this slice.

### Acceptance and future regression matrix

All outcomes below are **proposed Phase 2/3 acceptance**, not passing tests today. Phase 1 adds only corpus inputs and registers them in the existing round-trip harness. `macro-boundary-supported.keymap` and `macro-boundary-opaque.keymap` live under `packages/keymap-core/fixtures/corpus/`; they are synthetic editor fixtures, not firmware-build evidence. Their manifest `expect: splice` means existing source preservation, **not** macro editability. LF/CRLF no-op and randomized key-edit locality run automatically in `src/fixture-roundtrip.test.ts`.

| ID | Fixture / required variation | Required future assertion and seam |
| --- | --- | --- |
| M01 | Supported: `brackets`, `repeat_key`, `layer_mod` under `macros`; `zero_timing` is the macro under `behaviors`. Required mutations: arity/schema mismatch and duplicate properties. | Parse exact identity, timing and ordered steps; round-trip all zero/one/two-param pairs and both container locations; opaque reason for each invalid shape. New core macro parser tests, existing custom-bindings tests. |
| M02 | `repeat_key` repeats `1to1`; `pair_key` uses `1to1` and `1to2` into both `&mt` cells; `layer_mod` uses `2to1` and fresh forwarding after the pause; `pair_inputs` uses `1to1` and `2to2` into `&lt`. Required variations: unconsumed assignment at pause, assignment consumed before pause, post-pause overwrite before first invocation, duplicate destination controls, intervening controls, unused inputs, dangling controls and missing/extra args. | Explicit coverage for all four controls (`1to1`, `1to2`, `2to1`, `2to2`); one-shot reset; only unconsumed assignments cross the pause; post-pause last-write-wins before validation/type inference at invocation; all-use type intersection; modifier restriction; source/input/effective-target arity rejection. Do not count repeated placeholders as extra macro parameters. |
| M03 | Supported `profile` macro body forwards into `&bt BT_SEL`'s second cell, then invokes `&bt BT_CLR_ALL` with an alias-supplied implicit second cell. The layer's separate `BT_CLR_ALL` call is not macro-body coverage. Opaque `bad_command` omits BT_SEL's profile. Required variations: other supported BT commands and invalid arguments/forwarding. | Command additional-argument validation; all five profile values; negative/out-of-range/missing/excess args; reject forwarding selectors/hidden cells. No padding or truncating opaque imports. |
| M04 | `zero_timing` has zero properties and control values. Required variations: omit each property; negative, hex, fraction, overflow and expression values; nonzero initial properties with a pause but no before-pause timing controls; repeat with absent properties, with before-pause controls changing one/both timings, and with post-pause overrides. | Zero is not falsy/default; preserve absence and controls. Press uses initial properties or corresponding ZMK defaults; release starts with both timings zero unless before-pause timing controls change them, even when initial properties are nonzero. Post-pause controls override before the first release invocation. No synthetic sleep. Invalid imported node stays byte-identical/read-only. |
| M05 | Supported `nested` calls `repeat_key`; opaque `cycle_a`/`cycle_b`, `external_call`, `conflicting_types`. Add forward declaration, self-cycle, deeper DAG and a callee whose signature changes. | Order-independent resolution, transitive type constraints, cycle/unresolved/opaque diagnostics; block any edit invalidating callers; preserve every rejected definition. |
| M06 | Supported `delete_me` has only comment/string mentions; `brackets` has key, combo and sensor-child references; `repeat_key` has macro callers. Opaque `opaque_holder` references `delete_me`; add hold-tap child, raw property, `#define`, include and similarly prefixed labels separately. | Delete/rename succeeds only for unreferenced, completely covered targets; report each incoming site; unknown coverage blocks even without a visible reference. Comments/strings/prefixes alone do not block. Immutable source/model on refusal. |
| M07 | `macro_dial` is the supported zero-cell sensor adapter; layer uses it without args. Mutate to direct macro sensor binding, `&inc_dec_kp` phandle argument, parameterized/unknown adapter or extra child. | Only proven ordinary child slots accept macro invocations; global adapter effect explicit; preserve unrelated direction and adapter metadata. Core plus future EncoderBar/session tests; no general adapter editor. |
| M08 | Supported macros plus opaque siblings, unknown property, alias timing, multiple roots, duplicate labels, stock/control overrides, `ZMK_MACRO*`, preprocessor branches, unbalanced groups, partial fragments, unknown include. Existing rgblayer recipe tests remain mandatory. | Full-consumption eligibility and actionable reasons; unrelated ordinary save preserves source where already supported, otherwise safely rejects. Recipe is neither converted nor duplicated. New general eligibility must not weaken CHG-003 refusal. |
| M09 | LF/CRLF, Unicode comments, braces/quotes in comments/strings, single-line nodes, inline comments inside edited values, missing container, new-label collision; mutate only one timing/sequence/sensor child. | No-op exact bytes; compare every exterior interval on edit; comment-preserving edits or explicit refusal; delete retains adjacent comments; stale revision and overlapping edits reject atomically. Corpus harness plus focused future splice tests. |
| M10 | Required generator variations: text `[]{}`, backslash/vertical bar, ASCII letters/case/digits/all punctuation, spaces/repeats/LF/TAB; empty, 24/25 and 32/33 chars, CRLF, accented/Cyrillic/combining/emoji/surrogate input; active non-US Host view. The bracket fixture is only a sequence input, not generator coverage. | Exact fixed-table output; 24 taps use at most 48 queue entries, leaving a 16-entry margin against the pinned default; reject 25, 32 and 33 characters atomically. Explain that 32 taps can fill all 64 entries, and the margin cannot guarantee safety under arbitrary concurrent activity. No trimming; all-or-nothing invalid-input result; preview names US mapping; no Host mutation or automatic Unicode fallback. Future core generator and web session tests. |
| M11 | Literal `&mo 1`, forwarded layer input, same numeric profile/delay/filler, opaque macro layer use, nested forwarding; existing layer-operation fixtures. | Only proven layer slots remap if admitted; otherwise duplicate/reorder/delete refuse with source/model/history unchanged. No changes to command numbers or overwritten placeholders. |
| M12 | Create/use/edit/cancel/delete/export/reload; missing versus empty macro JSON, JSON/source mismatch, missing source, template precedence, Demo generation, undo/redo and recovered drafts. | Source and semantic model travel atomically; clone/diff see macro changes; unknown source survives; no-source/template refusal cannot lose definitions. Future core serialization, web lifecycle and Phase 3 browser tests. |

The additional negative/mutation cases are a required future matrix, not fixtures silently claimed to exist. Phase 2 must add executable tests before implementation and name any refused cases explicitly; Phase 3 supplies actual interaction evidence. The bounded fixtures do not justify widening the parser or changing UI in Phase 1.

## Phase 2 — Implement and prove the domain slice

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Implement macro parse/model/validation/splice in core, register supported references for key/combo/sensor editors, and extend shared serialization/diff/clone history.
2. Verify locality, round-trip, parameter inference and untouched unknown nodes. Preserve rgblayer behavior; do not convert every macro to a recipe.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the interaction and visual handoff

**Goal:** Make the new behavior usable and its canonical surface current.

1. Implement sequence/timing/parameter controls, macro list, text-to-sequence dialog, warnings and reference-safe delete in the SPA. Provide keyboard controls and preview before applying destructive operations.
2. Exercise create/use/edit/export/reload and undo/redo. Update CAP-001 canonical surface or add a separate current CAP only when its implemented surface and tests exist; never allocate a future CAP as proof.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update impacted CAPs and implementation/test links. Inspect every changed canonical HTML/PNG; validate Primary surface declarations. Add any new current CAP only alongside real behavior and proof.
2. Run the full integration gate below on the actual revision. Record exact commands/results, supported environment and remaining limitations. Retain any review package at its stable path and repair links.
3. Only then mark all phases done with evidence, mark the CHG done and move it to archive; update the change index. Do not commit/push/deploy without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` only for implemented CAP surfaces; render with `pnpm wireframes:render` and inspect the result. Before implementation, any optional proposal belongs in `docs/changes/reviews/CHG-005/` with a review-only README linked from this record. No proposal package exists or is required just to plan this change. Browser tests use synthetic fixtures and mocked GitHub, not real writes.

## Out of scope

- Firmware builds, executing macros on the host, full C preprocessor evaluation, arbitrary included .dtsi editing, unrestricted DTS AST rewrite.

## Execution state

Phase 1 is complete specification/fixture work only. Macro authoring is not implemented; CAP-001 and canonical visuals remain unchanged. Phases 2–4 remain pending. The verified record transition is included in this checkpoint; passing preservation tests is not macro-authoring acceptance.

### Candidate verification and review handoff

- Correction-pass source revision: `8bb9c49bd57e8be26566518f6de218140981672c`; this execution evidence does not replace the request baseline. Frozen Grok review findings required changes to pause forwarding, timing baselines, fixture/matrix claims and queue headroom. The previous frozen diff's review does not approve this corrected candidate.
- Environment rechecked: Node `v24.21.0`, pnpm `9.15.0`. The prior candidate recorded a successful `pnpm install --frozen-lockfile --ignore-scripts` without lockfile changes; installation was not repeated for this correction pass.
- Correction pass: `pnpm records:check` exited 0: 3 capabilities, 10 change records, wireframe manifest in sync.
- Correction pass: `pnpm --filter @keymap-editor/keymap-core test -- src/fixture-roundtrip.test.ts src/custom-bindings.test.ts src/behavior-recipes.test.ts src/layer-operations.test.ts` exited 0: 4 files, 120 tests passed after the supported fixture changes. This verifies preservation/recipe/layer-operation regressions, not the proposed macro acceptance matrix.
- Prior-candidate evidence only (not rerun in this correction pass): `pnpm --filter @keymap-editor/keymap-core test` exited 0: 61 files, 864 tests passed, 1 optional golden test skipped; `pnpm --filter @keymap-editor/keymap-core lint` exited 0. XKB non-character-include diagnostics were emitted, with no test failures.
- `git diff --check` exited 0. No production source, CAP, wireframe, dependency manifest or lockfile changed. Web/browser/build gates were not run: this slice adds no implementation or UI.
- DOX pass: core AGENTS.md now identifies the specification fixtures and their evidentiary limit. Root/docs/change/product/web contracts and child indexes stay unchanged because ownership, live behavior and review workflow did not change; no new durable directory boundary was introduced.
- Fresh Grok re-review after material corrections found no defects. It checked the pinned ZMK v0.3.0 semantics, restored request baseline, pause forwarding, timing baselines, fixture/matrix claims and queue headroom. The reviewed record transition is included in this checkpoint; Phase 2 remains pending.
- Residual review decisions: conservative include/opaque-source refusal, document-local (not cross-file) reference completeness, existing sensor-adapter child assignment without general adapter authoring, and the explicit ASCII/24-character generator limit with a 16-entry queue margin. Firmware compilation and physical host output are not verified; Phase 2 must prove the semantic/refusal matrix rather than treating the corpus's `splice` result as eligibility.
