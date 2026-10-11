# CHG-003 — Duplicate and reorder firmware layers safely

**Status:** done
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-001, CAP-003
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P2 — layer workflow

## Current boundary

The document editor exposes Duplicate and Move in the expanded non-stacked layer table. Keyboard position selection and internal drag/drop share the phase-2 core/editor transaction and conservative provenance checks. Demo and supported source-backed Clipboard are accepted; GitHub/dev-local and unsafe or unavailable source provenance remain refused. CAP-001/CAP-003 and canonical visuals describe this bounded behavior at `48c9c75`. Phase-3 execution/visual gates and its final fresh Grok review passed. Phase 4 passed the complete integration and visual gate without source changes; this archived closure receipt awaits fresh Grok review before any separately authorized commit.

[Parity evidence](../upstream-gap-assessment.md). These are requested outcomes, not present capability claims.

## Dependencies

No hard dependency on CHG-001/002. Complete before macro/behavior editors unless their layer-reference traversal contract is coordinated.

## Acceptance criteria

- Duplicate copies bindings and encoder turns without aliasing mutable state, uses a unique name/node identity, and is a single undoable operation. Define insertion position and whether self-references remain pointed at the original layer.
- Reorder preserves the meaning of known layer references in bindings, combo filters, conditional rules, sensor bindings and fixed recipes, and synchronizes active/visible layer state and legends.
- Treat layer zero/default-layer semantics explicitly: prevent moving it until a verified policy supports doing so. No silent semantic changes to opaque macros, external parameters or unsupported aliases; block unsafe reorder with an actionable warning.
- Offer keyboard-accessible move controls as well as drag/drop. Cancel/no-op moves are not edits; duplicate/reorder survive save, reload, undo and redo.

## Owned implementation and evidence seams

- `apps/web/src/lib/editor/document.svelte.ts`
- `apps/web/src/lib/components/HostLegendLayerRow.svelte`
- `apps/web/src/lib/editor.layers.test.ts`
- `apps/web/src/lib/editor.model.test.ts`
- `packages/keymap-core/src/compose-binding.ts`
- `packages/keymap-core/src/dts-splice.ts`

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | done (final fresh Grok review: No findings; records and focused core/web/lint gates passed; three intended RED probes retained) | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | done (core/web gates, focused suites, lint, records and diff checks passed; fresh Grok review: No findings) | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | done (web 69 files/689 tests; Playwright 42; wireframes/records gates and final PNG inspection passed; stale-refusal focus regression fixed; final fresh Grok review: No findings) | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | done (exact full gate exit 0 at 48c9c75; CAP-001/CAP-003 PNG inspection passed; existing optional/static-only skips documented below; closure patch awaits fresh Grok review) | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Define the reference graph, safe reorder preconditions and layer-zero policy. Inventory source-only references the current model cannot rewrite.
2. Add fixture/property regressions for permutations, repeated references, sensors, conditional rules, combo filters and unsafe opaque sources. Specify duplication semantics separately from reorder.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

### Phase-1 scope and evidence vocabulary

Direct operator request for this slice: “Continue autonomous execution with CHG-003 phase 1 only from clean committed HEAD 477ffe7. Read root, docs, docs/changes, docs/product, apps/web, packages/keymap-core DOX; product/changes READMEs; CAP-001/CAP-003; CHG-003; relevant architecture/ADR file contracts; and current layer editor/core source and tests before edits. First confirm working tree/index are clean and mark only phase 1 in-progress in CHG-003. Build the safe specification slice only: establish the reference graph and layer-zero policy, inventory source-only references that cannot be safely remapped, define duplicate insertion/self-reference semantics, and add focused acceptance/regression coverage that demonstrates current missing behavior or unsafe boundaries. Do not implement duplicate/reorder runtime operations, UI, drag/drop, or CAP/wireframe changes yet. Preserve source/opaque arguments and no concrete-board domain logic. Run phase-1 gate pnpm records:check plus focused RED/proposed regression checks; record exact evidence in CHG-003, do the DOX pass, and freeze the complete unstaged diff/evidence for fresh Grok review. Do not stage, commit, push, deploy, alter credentials, or start phase 2. Report exact paths, commands/results, scope decisions, and frozen diff hash.”

The following is a proposed contract for review, not current CAP behavior. No new production API, source model, migration or runtime operation is introduced. The new `packages/keymap-core/src/layer-operation-boundary.test.ts` runs existing functions only:

- Characterization/regression tests establish graph carriers, source-preservation limits and clone isolation.
- `RED:` probes express safety requirements those existing seams do not satisfy. Normally `it.fails` records expected failure; `CHG003_RED=1` runs the same assertions without inversion. Neither mode proves an operation exists. Phase 2 must add real operation acceptance tests rather than merely turn these probes green.
- The acceptance matrix below supplies explicit future oracles, including permutations and atomic editor behavior. It is not a second implementation-progress table.

Fresh-Grok correction scope: remove the unsupported schema-free second-slot RED expectation; specify discard identity restoration; align conditional sorting and global combo-filter semantics with current serializers; inventory multi-binding combo loss; enumerate all local stale-draft guards; and make UI copy names / ADR 0002 node allocation deterministic. Preserve the existing phase-1 work; no runtime/UI changes or phase-2 execution are authorized.

Final scoped correction authorized for the third fresh Grok review: distinguish every non-empty explicit combo filter, including a full enumeration of current indices, from absent/empty/editor-collapsed global filters. Add imported full-enumeration characterization only; preserve all prior phase-1 work and the no stage/commit/push/deploy/credentials/phase-2 boundary.

### Reference graph and ownership

A logical layer is not its current numeric index or its UI name. For a reorder, define `order[newIndex] = oldIndex`; validate a complete bijection of `0..N-1` with `order[0] = 0`, then derive the inverse `oldToNew[oldIndex] = newIndex` once. Rewrite each proven edge once from the original graph, never by sequential deletes/inserts or cascading token substitutions. Preserve repeated edges, collection order and all non-reference payloads, except that conditional `ifLayers` has existing order-insensitive set semantics with numeric sorting on save (duplicates retained). No broad numeric-token replacement or arbitrary recursive `params` walk.

| Carrier / existing seam | Proven edge or payload | Proposed transform boundary |
| --- | --- | --- |
| `ParsedKeymap.layers`, `layer_names` (`types.ts`, `keymap.ts`) | Row ownership, not references | Permute together; bindings retain physical key positions. Display names are not stable identity. |
| Stock `&mo`, `&to`, `&tog`, `&sl`, `&lt` (`data/zmk-behaviors.json`) | Parameter 0 is a layer only under the stock definition | Rewrite that leaf; `&lt` tap key/modifier wrappers are not layer edges. A source override invalidates stock assumptions unless verified compatible. |
| Named hold-tap calls (`dts-behaviors.ts`) | Each slot forwarding to a proven layer-taking child | Both slots may be layers, including the second. Require exact source definition / trusted editor preset provenance, arity and forwarding proof. `holdTaps.params`, a two-argument shape, and inferred legend heuristics alone are insufficient. Unknown children, cycles, fixed arguments or unresolved overrides block reorder. |
| `combos[].binding`, `combos[].layers` | Typed output edges and every numeric filter entry | Same schema walk for outputs; map filter entries, not `keyPositions`, timing, IDs or release flags. Only absent, empty and editor-collapsed filters are global, including the appended duplicate. Every non-empty explicit `layers` array remains scoped and never gains appended layer `N`, even if it enumerates all current indices. Empty filters may serialize as absent under the existing writer; preserve global meaning, not an absent/empty distinction through DTS. |
| `conditionalLayers[].ifLayers`, `.thenLayer` | Every prerequisite and result edge | Map all targets, retaining rule IDs and multiplicity; no delete-helper filtering/deduplication. Compare prerequisites using existing order-insensitive sorted-set behavior, retaining duplicates. `formatRuleNode` sorts numerically on save and must not change; save/reparse need not retain the mapped array's order. Recompute existing cover warnings from the result. |
| `sensorBindings[layer][encoder]` (`dts-sensors.ts`) | Row ownership plus proven edges in its binding | Permute rows; keep encoder order and CW/CCW order. Stock `&inc_dec_kp` arguments are keycodes, not layer indices. Unknown sensor definitions are opaque, not guessed from numbers. |
| Fixed `&rgblayer` recipe (`behavior-recipes.ts`) | Parameter 0 only when canonical recipe ownership is proven | Keep HSB values and recipe flag unchanged. Existing `rgblayer` label detection does not verify the macro body. A same-named custom body blocks reorder. |
| All other arguments / properties | Keycodes, BT profile indexes, Unicode codepoints, timings, HSB, opaque/excess arguments | Preserve exact tokens/tree values; do not infer edges from number shape or nested `&mo` text. Unproven semantic positions block reorder, not ordinary source-preserving editing. |
| Source layer nodes (`dts-keymap.ts`, `dts-splice.ts`) | DTS node name, label, properties, comments and source spans | Move logical source identity with the row or reject. Current splice attaches rows to nodes by index; swapping arrays alone is forbidden. Outside approved spans keep bytes/EOL stable. |
| Browser state (`document.svelte.ts`, `state.svelte.ts`, `layer-view.ts`) | `layerView.shown`, layer hover/conditional hover targets, open layer-scoped edit sessions | Remap existing-layer identities atomically, including on discard back to baseline; keep `layer0Raw`, host layouts/assemblies and host dirty state unchanged. Clear transient hover; block for every local draft listed below and any host-edit session rather than retargeting it silently. Keep `activeComboId` by ID. No invented global active-layer or edit-session field: selection/drafts are distributed across components. |

Strict targets are in-range integer model values or canonical decimal-string leaves with no child arguments. Aliases, `L2`/`l2` display tokens, hex/expression tokens, negatives, fractions, non-finite numbers and out-of-range targets are not silently normalized. Preserve them and reject a remap until a source-backed rule supports them. Existing deletion/display helpers accept some broader spellings; that does not establish a new remap contract.

Conditional save/reparse oracles use sorted prerequisites with duplicates retained when the writer serializes a changed block. Existing fingerprint-equal no-op splices may keep unsorted source bytes; compare those rules by the existing order-insensitive matching contract rather than forcing a rewrite. Do not change `formatRuleNode` or no-op source preservation.

### Layer zero, priority, duplication and transaction policy

- Reorder fixes the existing logical layer zero at index zero. Reject moving it or placing another layer before it. A one-layer document admits only identity reorder. This is not a change to existing deletion behavior, which currently permits deleting zero.
- Reorder preserves reference **target identity**, not every firmware outcome: numeric layer priority changes intentionally. Do not promise identical output when multiple layers are active. Surface this fact with the later controls and retain the existing conditional cover warning (a result layer at/below a prerequisite is not newly declared invalid).
- Duplicate appends at index `N`, never inserts beside the source. All old indices remain unchanged. Duplicating zero is allowed as an ordinary non-default layer at the end; default identity and `layer0Raw` remain unchanged.
- Deep-copy only the chosen key-binding row and its encoder row, including opaque/excess nested values. An absent `sensorBindings` stays absent; an explicitly empty selected row stays empty. A present but misaligned sensor matrix is rejected, not padded from another layer. No mutable node/array alias with the original, baseline or history.
- Copied self-references still point to the **original** layer, including layer zero. Do not redirect external references to the copy. Do not duplicate global combo definitions, conditional rules, hold-tap definitions or recipe nodes. Only absent filters, empty filters and selections already collapsed by `toggleComboLayer` to no filter are global and include the appended copy. Every non-empty explicit `layers` array remains scoped and never gains appended layer `N`, even if it enumerates all current indices: imported `[0,1,2,3]` excludes appended layer `4`. Do not collapse an explicit full enumeration merely because it covers the current layers, or misclassify an editor-collapsed no-filter selection as scoped. Do not manufacture a filter listing only the old layers for a global combo.
- New UI name: take `hostLegendLayerNames()[source]` from `document.svelte.ts` (exposed as the `editor.hostLegendLayerNames` getter), then choose the first unused exact, case-sensitive name across all effective names from `<name> copy`, `<name> copy 2`, etc. Its fallback is exactly `layer${source}`, not `L${source}` or `Layer #${source}`. Example: unnamed source 1 with existing `layer1 copy` and `layer1 copy 2` yields `layer1 copy 3`. Do not rename existing layers. DTS node IDs are independent: use only ADR 0002's `layer_N` allocation, with `N` the appended index and existing `uniqueDtsNodeId` collision suffixes (`layer_N_2`, `layer_N_3`, ...), never a slug of the UI name; never copy a DTS label. Source-only metadata on the selected layer must be accounted for before duplication: preserve known copied metadata with a unique display name, or reject unsupported properties/overlays rather than silently dropping them. This is not an arbitrary source-node clone feature.
- A successful operation is one immutable document transaction and one undo entry; redo, draft recovery, export and reload retain logical identity and all proven edges (conditional prerequisites compare in sorted order with duplicates retained). Reorder undo/redo applies the inverse/forward identity map to current view preferences, rather than rolling back unrelated eye toggles. Discard of a reorder must also restore stored `shown` marks to the same logical layer identities in baseline order, not leave them on the reordered numeric slots. This requires draft-to-baseline correspondence even after recovery with no undo history; an undo/redo inverse alone is insufficient. Eye toggles made after the reorder follow their logical layers back rather than being reset to an old preference snapshot. Unavailable stored `shown` preferences remain preferences; `effectiveShownLayers` alone determines rendered bounds. Duplication leaves view marks unchanged, including an already stored future index that becomes available. Do not auto-show the copy or evict an existing mark.
- Rejection, cancellation and identity reorder leave document, baseline/source, history/redo, dirty flags, view and persistence untouched (an actionable diagnostic is allowed). Complete validation and source-serialization feasibility checks before mutation. Block during publication or any stale layer-scoped local draft listed below; stale source/provenance after load/publish must be revalidated.

Local-draft guard inventory for both operations (future wiring, not existing global state):

| Owner | Block while this draft/session remains open |
| --- | --- |
| Every `Keyboard/Keys/Key.svelte` instance | Its `createKeyEditSession` editing state and staged row drafts, not only the hovered/current key |
| `Keyboard/EncoderBar.svelte` | Local `editing` layer/index and its binding session |
| `ComboPanel.svelte` | Its binding edit session, including a staged layer-taking output that could later overwrite remapped targets |
| `HostLegendPicker.svelte` / `HostLegendLayerRow.svelte` | Local `renamingIndex` / name draft, `pendingDelete`, and `editingWhen` / conditional-rule draft |
| Host editor | Existing `hostEditSession` |

Phase 2/3 must coordinate these owners explicitly and recheck at the transaction boundary. A global editor field is not available today; checking only `hostEditSession`, hover, or picker `busy` is not sufficient. Do not silently apply, discard or retarget a local draft to enable an operation.

### Source-only / unsafe-reference inventory

`ParsedKeymap` is not a closed source graph. `parseKeymap` drops parse warnings, and optional `undefined` can mean absent **or unparsed**. Source text, parse completeness and exact source revision must accompany preflight; a clean model, no warnings, or the absence of `originalSource` is not proof. `KeyboardSelection` currently carries original text only for Clipboard, not a general GitHub/local source-provenance contract. Those paths must remain disabled for unsafe operations until core preflight has the actual save inputs or a revision-bound result. Do not add an API bypass or fetch includes in this phase.

| Source-only boundary | Observed limitation / example | Required handling before reorder |
| --- | --- | --- |
| ZMK macro bodies | `bindings = <&mo 2>` inside a macro remains text with no parse warning | Reject with node/location; do not edit the literal or assume an unused macro is harmless. |
| Custom behavior definitions and stock overrides | Hold-tap parsing keeps behavior labels and inferred slot types but drops fixed child arguments (`<&mo 2>`); external child semantics may be unknown | Require verified simple forwarding schema, otherwise reject. Preserve original body. Coordinate this graph boundary with CHG-005/006, not a general macro implementation here. |
| `rgblayer` name collision | Existing detection accepts the name; save intentionally leaves an existing body alone | Only generated canonical recipe or verified identical semantics is supported; a label/flag alone cannot authorize remapping. |
| Partially parsed combo/rule blocks | Symbolic combo filters or `if-layers` omit the whole model field, including numeric siblings | Reject; never coerce omission to `[]`, which would remove source. Keep original blocks byte-identical on ordinary no-op saves. |
| Multi-binding combo source loss | For `bindings = <&kp A &mo 2>`, `parseDtsCombosDetailed` keeps only `binds[0]` with no warning. A fingerprint-equal no-op splice preserves the source, but a combo edit (e.g. timeout change) forces serialization and drops the later `&mo 2` | Preflight must account for every binding token/fragment in the actual source, not only `combos[].binding` or warning flags. Reject either operation when any binding is unrepresented or unresolved, even if the first binding has no layer edge. No-op byte preservation is not graph completeness. This phase inventories the loss; it does not repair the parser/writer. |
| Aliases / preprocessor expressions | Simple binding aliases expand under ADR 0002, but definitions and other uses remain outside the model; conditional compilation and multi-binding expansions obscure ownership | No reverse substitution or global define edits. Reject nontrivial reorder unless every affected use has a verified owner; unresolved aliases stay verbatim. |
| Includes, overlays, other DTS nodes | Included files are not parsed; labels/phandles, behavior/sensor overrides, layer masks and expressions may reference layer identity outside modeled spans | Unresolved/custom includes and overlays block reorder. Any later stock-include allowance must be an explicit tested core policy; warning-free parse alone is insufficient. Source omission on a JSON-first load does not imply a source-free document. |
| Layer metadata / source spans | Node IDs, labels, display names and extra properties stay at the original index in today's splicer | No row-only save workaround. Require an operation-aware source identity mapping and locality tests, or reject the source. Plain edit/save keeps ADR 0002 index semantics unchanged. |
| Template precedence and stale source | A supplied template outranks original source; JSON may outrank DTS on load | Preflight the actual selected save path and model/source agreement. Unknown template bodies or stale correspondence block; never fall back to generated text to evade refusal. JSON-only default-template support requires positively known source-free provenance. |

Append duplication does not require remapping old edges and may retain opaque binding values unchanged. It still requires valid known targets, an aligned model, a safe selected-layer copy and a verified save path; reject a detected source-only out-of-range target that would become live at `N`, or an unresolved layer-count dependency. Do not silently bless an uninspected source as safe. Diagnostics must name the offending model path or source node/token and suggest reviewing the source/definition externally; no warning-and-proceed override for an unsafe reorder.

### Acceptance matrix (proposed operation tests, not yet implemented)

Use synthetic layouts only. Fixture oracle: four named layers `[Base, Lower, Raise, Adjust]`, repeated target `2` in stock keys, combo output, sensor output and canonical recipe; scoped filter `[1,2]`; rule `[1,2] -> 3`; distinct encoder rows and opaque non-layer numbers. For `order = [0,2,1,3]`, `oldToNew = [0,2,1,3]`: every proven `2` edge becomes `1`, filter becomes `[2,1]`, rule targets map to `[2,1] -> 3` and save/reparse canonicalizes them to `[1,2] -> 3`, and names/sensors follow row ownership. A repeated rule `[1,2,2] -> 3` maps to `[2,1,1] -> 3` and saves/reparses as `[1,1,2] -> 3`, never deduplicated. Payload numbers, IDs and physical positions remain unchanged.

| Case | Required oracle / future seam | Phase-1 evidence |
| --- | --- | --- |
| Every base-fixed four-layer permutation; generated larger permutations | Real core operation maps every repeated edge exactly once; inverse restores model and logical source identity, comparing saved conditional prerequisites in sorted order with duplicates retained; identity changes nothing. Invalid length, duplicate/missing index, fraction, out-of-range and zero move reject without mutation. | Exhaustive six-permutation test shows today's splice moves only rows, not identities. No operation acceptance claim. |
| Known stock, declared hold-tap in either/both slots, canonical recipe | Exact target map across keys/combo output/sensors; unchanged tap/mod/keycode/HSB/BT/Unicode payloads; mixed known and unknown slots reject atomically. With verified `dual` forwarding to `&kp` then `&mo`, the future operation maps `&dual A 2` to `&dual A 1` under the fixture permutation. | Graph-carrier round-trip/clone test and passing declared second-slot characterization: schema-free deletion correctly leaves `&dual A 2` unchanged. Declaration-aware operation coverage remains future work, not a RED requirement on that helper. |
| Opaque binding, excess arguments, unsupported numeric spelling | Preserve full token/tree and reject uncertain reorder, including opaque nested behavior-looking text. | Opaque round-trip regression, seeded 100-case property, RED two-argument heuristic and nested-walk probes. |
| Combo global/empty/editor-collapsed/scoped filters (including explicit full enumeration) and repeated rules | Only absent, empty and editor-collapsed filters are global and include appended index `N`. Every non-empty explicit `layers` array remains scoped and never gains `N`, even if it enumerates all current indices: imported `[0,1,2,3]` still excludes appended `4`. Preserve scoped filter order/multiplicity, IDs and key positions; empty may serialize as absent. Conditional prerequisites save/reparse numerically sorted with duplicates retained; no delete semantics or writer change. Cover warning follows new priority. | Global-filter helper/save/reparse characterization; imported full enumeration stays explicit and excludes `4` through no-op save and forced serialization; carrier round-trip and sorted repeated-rule save/reparse regression; source-omission/removal regression. Actual operation transform tests remain proposed. |
| Duplicate middle/last/zero, repeated names, self/other references | Append one independent row/sensor row; deterministic effective-name copy suffix and independent ADR 0002 `layer_N` node allocation; old graph untouched; copied self-target stays original; globals not cloned. Mutating copied nested key/sensor nodes cannot mutate originals/history. | Existing deep-clone regression covers carriers; append/splice probe demonstrates `layer_4_3` allocation when `layer_4` and `layer_4_2` exist, ignoring the UI copy name. Actual duplicate and UI-name collision tests remain proposed. |
| Source text/metadata, aliases, macros, multi-binding combos, external includes, template priority | Refuse without mutation when graph incomplete, accounting for every combo binding token, not just the modeled first output; supported source-aware moves retain node identity/comments/properties/EOL and exterior bytes through save/reparse and JSON-first reload. Second save is stable. | Inventory no-op fixtures (including warning-free unsafe bodies/includes), multi-binding parse/save loss characterization, RED identity probe. Refusal, template and source-aware save tests remain proposed. |
| Editor transaction and selection | One undo entry; inverse/redo identity mapping and composed legends match target layers; current eye preferences and `layer0Raw` survive, no host table/snapshot dirty change. Every inventoried local session, rename, pending-delete, `editingWhen`, host edit and saving state rejects independently; cancel/no-op preserve redo and persisted draft. | Existing layer/sensor/model and component tests are compatibility checks only; new operation/history/recovery and each-owner guard tests belong to phases 2/3. |
| Discard reordered draft, also after recovery with empty undo history | Starting at `[Base, Lower, Raise, Adjust]` with stored `shown = [0,1,7]`, swap 1/2 to obtain `[0,2,7]`; discard restores baseline order and `[0,1,7]`, not `[0,2,7]`. If Raise is marked after the swap, discard yields `[0,1,2,7]`. Keep unavailable mark `7`, `layer0Raw`, host state and unrelated eye preferences. | Proposed operation oracle only. Existing discard tests cover add/edit, not reorder identity; undo/redo proof cannot substitute for this case. |
| Keyboard move and drag/drop | Identical transaction, focus and cancel/no-op semantics; announce zero restriction and priority effect | Phase 3 only. No UI/CAP/wireframe modification in this slice. |

Do not reuse `bindingReferencesLayer` as safety proof: it treats unknown two-parameter calls as possible hold-taps for display. Do not implement permutation through `remapLayerRefBindingAfterDelete`: it has destructive deletion semantics, no declaration context and recursively enters opaque children. Preserve existing behavior outside the new operation boundary until separately authorized.

## Phase 2 — Implement and prove the domain slice

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Implement immutable domain transforms in keymap-core, shared by editor actions. Preserve source node identity or explicitly migrate it safely during splice.
2. Update document state, undo/redo, selection, layer view and draft persistence in one atomic action; never change a macro parameter whose type is unknown.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the interaction and visual handoff

**Goal:** Make the new behavior usable and its canonical surface current.

1. Add duplicate and move controls to the layer row with focus management, meaningful labels and drag/drop parity.
2. Exercise moves in browser plus export/reparse locality. Update CAP-001 and CAP-003 current schematics and boundaries.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update impacted CAPs and implementation/test links. Inspect every changed canonical HTML/PNG; validate Primary surface declarations. Add any new current CAP only alongside real behavior and proof.
2. Run the full integration gate below on the actual revision. Record exact commands/results, supported environment and remaining limitations. Retain any review package at its stable path and repair links.
3. Only then mark all phases done with evidence, mark the CHG done and move it to archive; update the change index. Do not commit/push/deploy without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` only for implemented CAP surfaces; render with `pnpm wireframes:render` and inspect the result. Before implementation, any optional proposal belongs in `docs/changes/reviews/CHG-003/` with a review-only README linked from this record. No proposal package exists or is required just to plan this change. Browser tests use synthetic fixtures and mocked GitHub, not real writes.

## Out of scope

- General macro editor, arbitrary text refactoring, silently remapping unknown external arguments.

## Execution state

### Phase-4 closure receipt

Direct operator request: “Execute CHG-003 phase 4 only from commit 48c9c75 in the existing repository. Read root/docs/docs-change/docs-product/apps-web contracts, CHG-003, CAP-001/CAP-003, and current status first. Phase 4 has already been marked in-progress. Treat phase 3 source behavior as frozen: do not broaden features or refactor. Verify and close only if every gate passes: pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages. Inspect every changed CAP-001/CAP-003 canonical PNG after regeneration and record concrete visual observations. Distinguish environment/infrastructure blockers honestly; do not fabricate evidence or bypass failures. If all requirements pass, update CAP/CHG only where needed with exact evidence, mark phase 4 done, mark CHG done, move it to archive, update docs/changes/README.md, and complete DOX indexes; then freeze the complete unstaged tracked+untracked patch/evidence for fresh Grok review. Do not stage, commit, push, deploy, alter credentials, or start another CHG. Report exact commands/results, changed paths, visual inspection, frozen patch hash, and risks.”

Started on `main` at `48c9c757c29d625891f29f99e472f19ac1136fbd`, empty index, with only the operator's existing phase-4 in-progress CHG edit and no untracked files. Read root, docs, change, product, wireframe and web contracts, both READMEs, CHG-003 and CAP-001/CAP-003 before execution. Captured and reverse-apply/whitespace checked the starting patch externally. No stash, reset or index write. Phase-3 product source, tests, dependencies, generator and runtime contracts stayed frozen.

Environment: Node `24.21.0`, pnpm `9.15.0`, existing Playwright Chromium, local fixture-backed development/production/static-Pages servers. `PAGES_TEST_URL`, `PAGES_EXPECT_GITHUB`, `CHG003_RED` and `UPDATE_GOLDEN` were unset. No live deployment, real GitHub writes, new credentials, environment workaround or test bypass was needed.

The exact phase-4 command chain in the phase table ran once, in order, and exited **0** on 2026-10-11, from `08:46:47` to `08:51:23` UTC. Full raw evidence is under `/home/raphael/.hermes/profiles/hermes-dev/cache/scratch/chg003-phase4-44w4wvbn/`: `phase4-gate.log`, `gate-result.json` and `run_gate.py`. These are temporary review artifacts, not a second progress authority; the durable results follow.

| Command | Result from the exact full gate |
| --- | --- |
| `pnpm wireframes:generate` | Exit 0; 3 canonical screens generated; all generated files byte-identical to HEAD |
| `pnpm wireframes:render` | Exit 0; CAP-001 1440×1840, CAP-002 1440×1200, CAP-003 1440×1640; headings visible, no horizontal/vertical overflow or page errors; all PNGs byte-identical to HEAD |
| `pnpm records:check` | Exit 0; 3 capabilities, 10 change records, manifest in sync |
| `pnpm test` | Exit 0; core 60 files / 857 passed, 1 optional golden skipped; API 12 files / 226 passed; web 69 files / 689 passed; Cloudflare 1 file / 11 passed; record validator 72 passed, 0 failed |
| `pnpm lint` | Exit 0; all four workspace checks completed; Svelte 0 errors and 0 warnings |
| `pnpm build` | Exit 0; core, web and API built; Vite reported the existing >500 kB chunk-size warning |
| `pnpm test:e2e` | Exit 0; 42 passed, including all 4 layer-operation keyboard/drag/export/cancel/refusal cases |
| `pnpm test:e2e:prod` | Exit 0; 5 passed against the local production API/static build |
| `pnpm test:e2e:pages` | Exit 0; 2 passed, 2 deliberately skipped GitHub-auth cases in static Pages mode |

The Pages skips are the existing `test.skip(!expectGitHub, 'GitHub is deliberately disabled on static Pages')` guards at `e2e/pages/pages-smoke.spec.ts:47,65`, not failed tests or disabled checks added for closure. No live GitHub OAuth/cookie verification is claimed. The core skip is the absent optional untracked host-legend golden; no golden was manufactured. The three legacy `it.fails` boundary probes remain characterization, not real operation acceptance; `layer-operations.test.ts` separately passed all 60 operation cases. Expected xkb non-character-module and mocked error-path diagnostics are not test failures. No environment/infrastructure blocker occurred. Bundle size remains a non-blocking warning; no refactor was authorized.

### Phase-4 visual inspection and DOX pass

Inspected both actual final gate-rendered CAP-001/CAP-003 PNGs and their generated HTML, even though regeneration produced no changed visual bytes. Both records remain honestly `Primary surface: human` and `Status: partial`; their current behavior, bounded source support and implementation/test links need no edits.

- `docs/product/wireframes/exports/CAP-001-firmware-keymap-editing.png` — 1440×1840. The expanded table visibly lists Base/Lower/Raise with Duplicate and Move, with `Move · fixed` on Base. The separate Move Lower example shows destination `2 · Raise`, Apply move and Cancel; adjacent guidance states fixed layer zero and changed priority. The refusal panel names unverified sources/open drafts and GitHub/dev-local/source-less Clipboard restrictions. The Clipboard panel distinguishes UI `Lower copy` from raw-DTS `layer_4`. Full footer visible; no clipping or overlapping controls observed; small explanatory copy is dense but readable. SHA-256: `3c82bbb8abed454aa75f706e87913efec2c7432254484323f88e38c5723b5a5f`.
- `docs/product/wireframes/exports/CAP-003-host-layouts-and-legends.png` — 1440×1640. Base/Raise/Lower row order agrees with `Moved Lower to position 2`; Base is marked fixed, all rows show Duplicate. The eye-identity text explains move/undo/redo/discard and no automatic copy visibility. Separate host-edit blocking and after-move panels state no discarded host glyphs, unchanged host tables/assemblies/dirty state and Demo/verified Clipboard restrictions. Full footer visible; no clipping/overlap observed, with dense but readable explanatory copy. SHA-256: `f1aeeb1dbb0a047bbe45b23744bdb50b458cac918d2a51ce31094ac27785f8d7`.

These are schematic observations, not proof of runtime enforcement, firmware execution or OS installation. The behavior suites supply the separate executable evidence. CAP-002 and all canonical inventory/index assets also regenerate byte-identically; no visual edits or proposal promotion occurred.

DOX pass: archived this verified CHG and updated `docs/changes/README.md` to remove it from the active queue, add the archive link and remove the obsolete instruction to start CHG-003. Corrected stale present-tense historical phase-status statements below. Root, docs, changes, product, wireframe and web `AGENTS.md` remain intentionally unchanged: no ownership, workflow or child boundary changed, and every Child DOX Index is still complete. CAPs, product index, architecture and ADRs remain unchanged because the phase verifies the existing bounded behavior rather than changing it. No review package exists to relocate or relink, and no other CHG starts.

Post-edit validation initially exited 1 because the patch tool applied text edits but ignored its move directive: the done record remained in `active/`, and the archive link was broken. Completed the intended filesystem move without touching the index; `pnpm records:check && git diff --check` then exited 0. This corrected documentation-transition failure did not affect the successful full product gate. Repeat the record/diff check after the final receipt edits and retain it in `final-checks.log`.

Freeze the complete unstaged tracked diff plus the untracked archive addition, not the tracked deletion alone. The external `review-manifest.json` binds the base, exact inventory, per-file hashes, inspected PNGs and evidence to `complete.patch`; reverse-apply/whitespace check and recapture comparison must pass before handoff. Keep the final patch hash outside this CHG to avoid self-reference. Fresh phase-4 Grok review is **pending**; hand off for operator `/new` then `/model grok` without claiming a model switch, approval, commit or deployment.

### Phase-3 scope

Started from clean committed `af9912f1f597ff4f61eb40153979d2013bb876f0` on `main`, empty index, Node `24.21.0`, pnpm `9.15.0`. Direct operator request: “Continue autonomous execution with CHG-003 phase 3 only from clean committed HEAD af9912f. Read the final CHG-003 phase-2 record, root/web/docs/product/changes and wireframe DOX, CAP-001/CAP-003, relevant current components/tests/e2e before editing. First mark phase 3 in-progress. Implement only the human interaction/visual handoff: accessible duplicate and move controls in the layer row, keyboard-accessible controls plus drag/drop parity, focus/cancel/no-op semantics, browser/export/reparse coverage, and current CAP-001/CAP-003/canonical wireframe updates only for shipped behavior. Preserve phase-2 headless safety/provenance restrictions; no server/API expansion, staging, commit, push, deploy, credential changes, or phase 4. Run the exact phase-3 gate and inspect rendered visuals; record evidence, DOX pass, freeze complete unstaged diff for fresh Grok review. Report changed paths, commands/results, visual evidence, hash, and risks.”

At that checkpoint, phase 3 awaited independent review and phase 4 had not started. The phase table and phase-4 receipt above are the current execution status; the phase-2 receipt below describes the approved starting implementation.

### Phase-3 resumed checkpoint

Direct operator request: “Resume the interrupted CHG-003 phase 3 checkpoint from clean base af9912f without discarding current unstaged work. Read all six changed files, phase-3 CHG, web/docs/product/wireframe DOX, CAP-001/CAP-003, and the existing evidence before edits. First rerun the final focus/CSS component suites and the targeted Playwright layer-operations suite; fix only confirmed failures. Then complete the phase: CAP-001/CAP-003 present-tense behavior/test links, canonical generator-only wireframe updates, generate/render and inspect actual final PNGs, full exact phase-3 gate, DOX/CHG evidence, and complete tracked+untracked freeze for fresh Grok review. Do not stage, commit, push, deploy, change credentials, or start phase 4. Treat prior reported tests as unverified until reproduced.” Subsequent steering: “Continue the phase-3 resume exactly as scoped after the allowed checkpoint capture. Reproduce focused tests before further edits.”

Resume confirmed `main` at `af9912f1f597ff4f61eb40153979d2013bb876f0`, empty index, four modified and two untracked checkpoint files, Node `24.21.0`, pnpm `9.15.0`. All six files, applicable DOX/records, CAPs and prior phase-3 logs were inspected before edits. Captured the complete starting binary patch including both untracked tests outside the repository and reverse-apply/whitespace checked it; no stash/reset/index writes. Earlier logs (including misleading `*-green.log` names containing failures) were historical diagnostics, not acceptance evidence.

- The preserved interaction slice exposes labeled native Duplicate/Move buttons, a focused native position selector with Apply/Cancel, internal native drag/drop, polite result/refusal status, fixed layer zero and explicit priority guidance. Focus remains on the source duplicate or follows the moved row; a short focus handoff keeps the overlay mounted. Hidden-layer cells are dimmed without dimming the structural controls. Controls are absent from the resting strip and language-stack mode.
- Move drafts capture the exact document object. Stale moves refuse; Apply and drop use the same headless operation, preserving provenance and registered-draft guards. Cancellation, no-op and external drops preserve document/source/history/redo/view/persistence. No domain, persistence adapter, API or credential changes were made in this phase.
- First reproduced component run: 41/41 passed. First browser run: 2 passed, 2 failed at the re-import picker lookup, after their move/export assertions had passed. The source picker changes its accessible dialog title once a keyboard is loaded; the new test incorrectly matched only the initial title. The correction scopes the dialog by its existing keymap textbox. No product behavior was changed to accommodate this test. The same browser command then passed all four cases, including re-import and stable second export. RED traces/screens are retained separately.
- CAP-001/CAP-003 now state the current controls, focus/no-op semantics, proven references, append/source-name policy, source refusals, view identity and host isolation, with links to component, core, lifecycle and real-browser evidence. The Clipboard browser oracle respects existing textarea newline normalization and loader trimming; it does not claim preservation of pre-input CRLF/outer whitespace or raw-DTS round-trip of the UI copy name.
- Only canonical `generate.mjs` definitions were edited for visuals. Generated CAP-001/CAP-003 HTML/PNG and manifest viewports changed. Initial rendering correctly rejected vertical overflow; affected viewports were enlarged in the generator. CAP-002 and the index regenerate byte-identically. No review-package assets were promoted, no new CAP was created, and both affected records remain honestly `Primary surface: human` / `Status: partial`.

### Phase-3 verification and visual evidence

Final commands ran at the unchanged base with the pinned environment. Evidence is under `/home/raphael/.hermes/profiles/hermes-dev/cache/scratch/chg003-phase3-resume-r90a5hca/`; scratch files are temporary review artifacts, not another progress authority. Durable commands/results are retained here.

| Command | Result | Log |
| --- | --- | --- |
| `pnpm --filter @keymap-editor/web test src/lib/components/HostLegendPicker.layer-operations.test.ts src/lib/components/HostLegendPicker.test.ts` | Exit 0 before resumed edits; 2 files, 41 passed, including 17 operation cases | `components-resumed.log` |
| `pnpm test:e2e e2e/layer-operations.spec.ts` | First exit 1: 2 passed / 2 re-import locator timeouts; corrected exit 0: 4 passed | `browser-resumed.log`, `browser-green.log`; `browser-red-artifacts/` |
| `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` | Exact phase-3 gate, exit 0 after final source/test/generator edits: web 69 files / 688 passed; Playwright 42 passed; 3 screens generated/rendered without overflow/page errors; 3 CAPs / 10 CHGs validated | `phase3-gate.log` |
| `pnpm --filter @keymap-editor/keymap-core test src/layer-operations.test.ts` | Exit 0; all 60 real operation cases passed (not the inverted phase-1 probes) | `core-operations.log` |
| `pnpm --filter @keymap-editor/web lint` | Exit 0; 0 errors, 0 warnings | `web-lint.log` |
| `pnpm records:check && git diff --check` | Exit 0 after final evidence edits; complete tracked/untracked patch also reverse-apply/whitespace checked | `final-checks.log`, `freeze-check.log` |

Web stderr contains expected xkb non-character-module notices and mocked GitHub error-path diagnostics; no failed tests. Browser tests use fixtures and mocked GitHub, not real remote writes. The phase-4 integration sequence (`pnpm test`, workspace lint/build, production/Pages browser gates) was not started.

Inspected the actual final gate-rendered PNGs, not earlier HTML or a validator-only result:

- `docs/product/wireframes/exports/CAP-001-firmware-keymap-editing.png` — 1440×1840; Duplicate/Move, fixed base, position selector/Apply/Cancel, source refusals and raw-DTS name limitation are readable. Full footer visible; no clipping/overlap or contradictory supported-source claim observed.
- `docs/product/wireframes/exports/CAP-003-host-layouts-and-legends.png` — 1440×1640; Base/Raise/Lower order agrees with the moved status. Eye identity, host isolation, host-edit blocking and supported-source limits are readable; full footer visible, no clipping/overlap observed.
- Actual browser screenshots from keyboard/drag success and unsafe-source refusal are retained with the final gate artifacts. The inspected keyboard/refusal screens show visible controls/focus and readable status/diagnostics; these supplement, not replace, the browser assertions. Dense UI remains a schematic/runtime distinction, not a firmware compatibility claim.

DOX pass: updated nearest web `AGENTS.md` for the visible shared transaction, captured move draft, external-drop refusal and focus/overlay contract; removed its obsolete “headless” qualifier. Root, docs, changes, product and wireframe DOX remain unchanged because their ownership, workflows and child indexes are unchanged. Core DOX, architecture and ADRs remain unchanged: this slice consumes existing phase-2 contracts rather than changing them. Existing CAP links/index entries still target the same generated pairs; no new child boundary or index entry is needed. No phase-4 progress or archive/index transition occurred.

Phase-3 freeze protocol: after record/diff checks, capture `git diff --binary --full-index --no-ext-diff HEAD`, append sorted `git diff --no-index --binary --full-index -- /dev/null <path>` for both untracked tests, and reject any unexpected path. Assert unchanged base and empty index, then `git apply --reverse --check --whitespace=error-all` the complete patch. The external `review-manifest.json` binds the SHA-256 complete patch, exact tracked/untracked inventory, per-file hashes, final visuals and gate/RED evidence. Re-capture and compare before handoff; do not put a self-referential final hash in this CHG. That checkpoint awaited review with phase 4 pending; the completed phase-3 result is recorded in the phase table above.

### Phase-2 original execution receipt

Phase 2 started from clean committed `fe1386d8f5028e16b6bbab13499b27e3d187558b` on `main`, with an empty index, Node `24.21.0` and pnpm `9.15.0`. Direct operator request: “Continue autonomous execution with CHG-003 phase 2 only from clean committed HEAD fe1386d. Read the final phase-1 contract, root/core/web/docs DOX, CAP-001/CAP-003, ADR 0002, and all relevant core/editor source/tests before edits. Implement the complete approved domain slice only: immutable duplicate/reorder transforms shared by editor actions; strict preflight/rejection based on phase-1 typed/proven graph and source preservation rules; layer-zero restriction; duplication append/self-reference/name/node policies; known reference remaps including lifecycle/history/view/discard identity requirements; source-aware splice/locality boundaries. Add focused passing operation tests. Do not build UI controls, drag/drop, CAP/wireframe changes, stage, commit, push, deploy, alter credentials, or start phase 3. Mark phase 2 in-progress before edits; run its core/web gate plus focused relevant checks and records validator; record exact evidence and freeze a complete diff for fresh Grok review.”

### Phase-2 resumed checkpoint and implementation boundary

Direct operator request: “Resume CHG-003 phase 2 from the interrupted, unstaged main-checkout checkpoint at HEAD fe1386d. You must inspect every current changed file and relevant source/tests/DOX before modifying anything. Do not discard or overwrite the existing checkpoint. Complete only phase 2: finish the lifecycle/source-preservation audit and focused acceptance coverage; fix any defects; run the exact complete phase-2 core/web gate, targeted operation suites, both core/web lint, records validator, and diff check; complete the required DOX/CHG evidence; then freeze/hash the complete unstaged patch including all untracked files for fresh Grok review. Do not add UI controls/drag-drop, CAP/wireframes, staging, commit, push, deployment, credentials, or phase 3. The prior worker reached iteration limit and did not complete final verification or freeze evidence, so treat all claims as unverified until reproduced.”

Resume verified `main` at `fe1386d8f5028e16b6bbab13499b27e3d187558b`, empty index, 18 modified and 5 untracked checkpoint files, Node `24.21.0`, pnpm `9.15.0`. Every checkpoint file was inspected. The original complete patch was captured outside the repository before edits and reverse-apply checked; no stash/reset/index writes occurred. Earlier worker verification claims were not reused.

- Core `operateLayers` preflights model shape, strict targets, base-fixed bijections and complete serialization before returning an immutable result. Duplicate appends independent key/sensor rows, keeps original self-targets and global graph definitions, uses effective-name copy suffixes and spliced `layer_N` allocation. Reorder maps proven edges once, permutes names/sensors and moves logical source node spans before invoking the ordinary shared save contract.
- Source support is deliberately closed: one root/keymap; explicit stock include allowlist; represented combo/rule properties; simple verified two-slot hold-tap forwarding; canonical RGB recipe with stock dependencies; layer bindings, sensors, display-name, labels and comments. Unsupported metadata, macros, fixed/unknown forwarding, aliases/preprocessor dependencies, external includes/overlays, partial parses and unrepresented binding fragments reject before mutation. Template precedence and unavailable provenance reject rather than generate a replacement file. No include fetch or API bypass was added.
- Browser operations are headless. Demo supplies source-free provenance; Clipboard supplies the exact current source and source-model correspondence. GitHub/local and source-less Clipboard reject until an actual operation-aware save-input contract exists. JSON-first save/reload retains UI names separately from DTS node identity under ADR 0002; this slice does not change the raw-DTS parser's naming policy.
- Document/history/source/IDs commit together. Current eye inclusion order and unavailable marks survive inverse/redo/discard mapping; recovered drafts retain baseline correspondence without undo history. Copy/publish receipts capture identity with the sent document. Local guard readers cover every mounted key (including retained hidden row drafts), encoder, combo binding, rename, delete confirmation and conditional-rule editor, plus host sessions, publication and staged definitions. Hover owners are cleared; host data and selected combo ID stay independent.

### Phase-2 audit corrections and acceptance coverage

All corrections below were reproduced against the preserved checkpoint with focused tests before production edits:

1. Undo during an in-flight copy could return to `identityAware: false`; a copied reorder of identical rows then looked clean and lost recovery metadata. Identity tracking now remains active within the loaded session across history restoration. The regression covers copy completion, equal model/different identities, persistence, empty-history recovery and discard/view/source restoration. The first test attempt stopped at an irrelevant missing fixture metadata comparison; the corrected RED reaches the intended `isDirty` assertion.
2. Ordinary Local/GitHub publication did not capture the sent layer metadata. After Add Layer, successful unchanged publication retained stale undo history and assigned fresh baseline IDs. Both adapters now capture the metadata before I/O; two RED cases became passing publication compatibility regressions. Operations remain refused for these unverified source paths.
3. A canonical RGB recipe body was accepted when one of its internal macro forwarding/control labels was overridden by a custom definition. Six RED cases now reject both operations with the named dependency; the check is declaration-order independent and derives dependencies only after canonical-body proof.

Additional passing coverage exercises old copy-sheet acceptance with a newer structural draft, stale receipt/source revision refusal, recovery mismatch against both changed model and source, composed rows and conditional cover warnings, selected combo/host isolation, and retained key-row drafts after the visible editor closes. Core coverage also proves that stale UI hold-tap slot hints cannot authorize or redirect remapping, escaped quotes cannot spoof recipe canonicalization, and extra scalar source cells are refused. Source-derived forwarding schemas—not `holdTaps.params`—are authoritative; parameter hints intentionally do not enter the source graph fingerprint. Empty sensor rows remain supported, not padded to match another row's encoder count.

The new operation suites are separate from unchanged `layer-operation-boundary.test.ts`: its three inverted expected failures still characterize unsafe legacy seams and are not passing duplicate/reorder acceptance. No schema-free delete walker, conditional sorting writer or general parser was rewritten to turn those probes green.

### Phase-2 verification and review handoff

Final verification ran from the repository root in the pinned environment. Logs and the frozen patch/manifest are under `/home/raphael/.hermes/profiles/hermes-dev/cache/scratch/chg003-phase2-resume-OI2nIRwc/`. This is temporary gate/review evidence, not a second progress authority; the durable commands and results are recorded here.

| Command | Result | Log |
| --- | --- | --- |
| `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` | Exit 0; core: 60 files, 857 passed and 1 optional golden skipped; web: 68 files, 671 passed | `phase2-gate.log` |
| `pnpm --filter @keymap-editor/keymap-core test src/layer-operations.test.ts src/layer-operation-boundary.test.ts src/dts-splice.test.ts src/dts-conditional-layers.test.ts src/dts-sensors.test.ts src/dts-behaviors.test.ts src/behavior-recipes.test.ts src/custom-bindings.test.ts src/keymap-clone.test.ts src/dts-combos.test.ts src/combo-edit.test.ts` | Exit 0; 11 files, 259 passed, including 60 real operation cases and the 3 inverted legacy probes | `core-focused.log` |
| `pnpm --filter @keymap-editor/web test src/lib/editor.layer-operations.test.ts src/lib/editor.layers.test.ts src/lib/editor.sensor.test.ts src/lib/editor.model.test.ts src/lib/editor.publish.test.ts src/lib/editor/clipboard-copy.test.ts src/lib/publish-keymap.test.ts src/lib/key-edit-session.test.ts src/lib/components/ComboPanel.test.ts src/lib/components/HostLegendPicker.test.ts src/lib/components/Keyboard/EncoderBar.test.ts src/lib/components/Keyboard/Keys/Key.test.ts` | Exit 0; 12 files, 267 passed, including 23 operation/lifecycle cases | `web-focused.log` |
| `pnpm --filter @keymap-editor/keymap-core lint` | Exit 0; TypeScript no-emit check | `core-lint.log` |
| `pnpm --filter @keymap-editor/web lint` | Exit 0; 0 errors, 0 warnings | `web-lint.log` |
| `pnpm records:check` | Exit 0; 3 capabilities, 10 change records, wireframe manifest in sync; repeated after evidence edits | `records.log` |
| `git diff --check` | Exit 0; repeated after evidence edits; the complete patch also receives a whitespace/reverse-apply dry run | `diff-check.log` |

The complete gate was reproduced twice after the final production/test edits; the captured run above is the review receipt. Core/web stderr includes expected xkb non-character-include notices and mocked GitHub error-path diagnostics; no failed tests. No optional golden was manufactured. The pre-fix `identity-copy-red-corrected.log`, `publish-identity-red.log`, and `recipe-dependencies-red.log` preserve 1, 2, and 6 intended assertion failures respectively; matching `*-green.log` runs passed. Supplemental acceptance checks passed before the complete gate.

DOX pass: updated nearest core/web `AGENTS.md` for operation/source ownership, synchronous mounted-draft guards, sent-document metadata and identity-preserving history/recovery. The owning CHG records the bounded implementation, reproduced defects, checks and review status. Root/docs/change/product DOX, READMEs, architecture, ADRs, CAPs and wireframes intentionally remain unchanged: no ownership/index boundary, architecture fork or exposed interaction was added; CAP/visual work is expressly deferred to phase 3. No child doc/index was created. Legacy add/delete still use their existing save semantics; layer-count changes that no longer match a retained source proof refuse subsequent operations until saved/reloaded rather than guessing identity.

Freeze protocol: capture `git diff --binary --full-index --no-ext-diff HEAD` and append sorted `git diff --no-index --binary --full-index -- /dev/null <path>` output for every non-ignored untracked file (exit 1 denotes differences). Assert the index is empty, the base is unchanged and the untracked inventory is exactly the two web and three core checkpoint files. Verify the combined patch with `git apply --reverse --check --whitespace=error-all`, then SHA-256 it. The external `review-manifest.json` records the complete patch hash, per-file and log hashes, base and exact path inventory; no self-referential hash is embedded here. Re-capture and compare before handoff. Keep all reviewed files unchanged until fresh Grok review.

Implementation and requested gates were verified. Fresh Grok reviewed complete frozen patch `3db593010bc2b620cdad73743fe2301b83adf2f9b0da01e457da149629504075`, including the tracked and untracked paths, reverse-apply check, evidence hashes, contracts, source provenance, lifecycle and guard behavior, and returned **No findings**. Phase 2 was done; phases 3 and 4 were pending at that checkpoint. No UI controls, drag/drop, CAP/wireframes, staging, commit, push, deployment or credential changes occurred during phase-2 implementation or review.

### Prior phase-1 receipt

Phase 1 was verified against `477ffe7c636d40a63b86e60ed692194a50f222d4` on `main` and subsequently committed as `fe1386d`. The original slice began with a clean tree/index; fresh-Grok corrections resumed its existing unstaged CHG/core-DOX/test patch with an empty index. Node `24.21.0`, pnpm `9.15.0`. Specification and focused RED/proposed regressions only; no runtime duplicate/reorder, UI, CAP or wireframe changes. The authorized third fresh Grok review of complete patch `44b2fd49524886f674505a9f70bb6d8e62220e825779d623ece447eb09e8e152` returned **No findings**. Phase 2 was pending at that closeout. No staging, commit, push, deployment or credential changes occurred during phase execution or review.

### Phase-1 verification evidence

All commands below ran from the repository root with the pinned environment after the final scoped combo-filter correction. Logs are captured in `/home/raphael/.hermes/profiles/hermes-dev/cache/scratch/chg003-phase1-review3-c3lhq_nt/`; this is a review handoff artifact, not a competing progress record. Scratch artifacts are temporary; this record retains the commands and outcomes. This table supersedes earlier gate counts while retaining the three intended RED probes: expecting schema-free deletion to remap `&dual A 2` was a test-contract defect, not an implementation gap to fix in that helper.

| Command | Result | Log |
| --- | --- | --- |
| `pnpm records:check` | Exit 0; 3 capabilities, 10 change records, wireframe manifest in sync | `records.log` |
| `CHG003_RED=1 pnpm --filter @keymap-editor/keymap-core test src/layer-operation-boundary.test.ts` | Expected exit 1: 18 passed, exactly 3 assertion failures, no setup/import errors | `red.log` |
| `pnpm --filter @keymap-editor/keymap-core test src/layer-operation-boundary.test.ts src/dts-splice.test.ts src/dts-conditional-layers.test.ts src/dts-sensors.test.ts src/dts-behaviors.test.ts src/behavior-recipes.test.ts src/custom-bindings.test.ts src/keymap-clone.test.ts src/dts-combos.test.ts src/combo-edit.test.ts` | Exit 0; 10 files, 199 passed (includes 3 inverted expected-failure probes, not 199 implemented feature assertions) | `core-focused.log` |
| `pnpm --filter @keymap-editor/web test src/lib/editor.layers.test.ts src/lib/editor.sensor.test.ts src/lib/editor.model.test.ts src/lib/key-edit-session.test.ts src/lib/components/ComboPanel.test.ts src/lib/components/HostLegendPicker.test.ts src/lib/components/Keyboard/EncoderBar.test.ts src/lib/components/Keyboard/Keys/Key.test.ts` | Exit 0; 8 files, 181 passed; xkb non-character include skip notices on stderr | `web-focused.log` |
| `pnpm --filter @keymap-editor/keymap-core lint` | Exit 0; TypeScript no-emit check | `core-lint.log` |
| `git diff --check` | Exit 0; no whitespace errors | `diff-check.log` |

Observed RED assertions, intentionally not fixed in this phase:

1. `bindingReferencesLayer('&external 2 A', 2)` returns `true`, not the proposed proven-edge `false`.
2. The deletion walker changes an opaque nested `&mo 2` subtree to `&mo 1`.
3. Swapping nonzero binding rows retains source names `[base, lower, raise, adjust]`, not logical order `[base, raise, lower, adjust]`.

The removed former RED 3 is covered by a passing characterization: the parsed declaration exposes `['code', 'layer']`, but `remapLayerRefBindingAfterDelete` receives no declaration and correctly retains `&dual A 2`. The declaration-aware permutation requirement remains in the future-operation matrix, not in this helper's expected output.

The new file has 21 tests: 18 positive characterization/regressions and 3 expected failures. Added coverage proves numeric conditional sorting without deduplication (and fingerprint-equal no-op preservation), global absent/empty/editor-collapsed filters on a future layer, multi-binding combo model loss and source loss on forced rewrite, and independent `layer_N` collision allocation. The final scoped characterization imports `layers = <0 1 2 3>` into a four-layer model, proves applicability to each current index but not `4`, checks byte-identical no-op save, then forces combo serialization via a timeout edit and checks both generated and spliced save/reparse retain `[0,1,2,3]` and exclude `4`. It does not implement or exercise duplication. The permutation characterization enumerates all six base-fixed four-layer orders; the opaque property uses seed `3003`, 100 runs. No duplicate/reorder acceptance test is reported green. Discard identity, all-owner guards and UI duplicate-name generation remain explicit future-operation oracles, not implementation claims. Full workspace tests/build, browser gates and visual generation were not run: this slice changes no runtime or visual behavior and does not start later phase gates.

Prior probe correction evidence remains in `/home/raphael/.hermes/profiles/hermes-dev/cache/scratch/chg003-phase1-corrections-27r2uzxa/`: `baseline-red.log` reproduces the original four failures before edits. The first correction run incorrectly expected a no-op combo splice to drop the later token; `first-correction-attempt/` retains that failed characterization. Source inspection of `applyCombos` confirmed the fingerprint short circuit. The corrected probe asserts byte-identical no-op preservation, then changes timeout to force serialization and proves the later binding is lost; no production source was changed. The final combo-filter correction preserves this evidence and all prior probes. Final commands/results above are the third-review handoff gate evidence.

DOX pass: the complete phase-1 patch still contains this CHG, `packages/keymap-core/AGENTS.md`, and the new core test. The nearest core DOX documents probe ownership, the RED command mode, and separation of existing helper/serializer characterization from future declaration-aware operations. This final correction leaves that prior core DOX edit untouched because the durable probe procedure is unchanged. Root/docs/change/product/web DOX, READMEs, architecture, ADRs, CAPs and visuals remain unchanged: ownership/indexes and shipped contracts are unchanged; the proposal stays in its CHG. No new child boundary or Child DOX Index entry is needed. `formatRuleNode`, all production sources, and all existing tests remain unchanged.

Phase-1 freeze protocol: after final record validation and `git diff --check`, capture `git diff --binary --full-index --no-ext-diff HEAD` plus the new test's `git diff --no-index --binary --full-index /dev/null <path>` (exit 1 means differences). The tracked-only diff would omit the test. Validate the combined patch with `git apply --reverse --check`, hash it with SHA-256, and include the patch hash, log hashes, exact base and unstaged path inventory in the external review manifest. Keep the hash outside this CHG to avoid self-reference. The authorized third fresh Grok review verified the complete patch fingerprint, scope, final combo-filter characterization, prior corrections, evidence and contracts, then returned **No findings**. That doc-only closeout recorded phase-1 approval; current execution state is recorded above.
