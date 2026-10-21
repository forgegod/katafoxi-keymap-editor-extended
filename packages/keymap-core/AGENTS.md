# Shared domain

## Purpose

Shared domain.

## Ownership

Firmware parse/splice/generate, binding catalogs, host layouts, composed legends, fixture data, and domain tests. `filesystem-keymap.ts` owns the browser-filesystem firmware-only save boundary.

## Local Contracts

Pure domain code shared by browser and API. Preserve untouched source text; fail closed on unsupported ambiguous edits. No concrete keyboards in product logic. Keep keycapFace as the sole face-packing contract. Keep host registry synchronous.

`repository-keymap.ts` owns exact selected-path validation, deterministic legacy/scoped sidecar paths and host-reference compatibility. Never normalize an unsafe path into an allowed identity or resolve missing repository user tables through the browser-global registry. Adapters prove pinned-tree ownership and permissions before using these pure rules.

JSON validation and primary-source detection retain `&reset` as an exact legacy import label, separate from the stock picker catalog, docs links, and role ordering. Preserve its token and opaque arguments; never rewrite it to `&sys_reset` or infer a schema. Other unknown labels still require the existing explicit source-import option or declared-model allowance.

`operateLayers` owns immutable duplicate/reorder preflight and transforms; `layer-operation-source.ts` owns its closed source subset and logical node moves. Require actual source plus matching baseline, or positively source-free provenance; templates and unknown save paths reject. Derive layer slots from verified forwarding definitions, not UI hints or recursive numeric-token searches. Canonical recipes also require unoverridden dependencies. Plain save/delete helpers retain their existing contracts.

## Work Guidance

Add focused round-trip and locality tests for file transformations. Preserve unknown external binding parameters. ZMK macros are not C preprocessor aliases. Demo boards belong in fixtures.

`buildFilesystemKeymap` is the only core entry for the browser filesystem source: it splices one existing raw `.keymap` via `buildKeymapCode` and returns only `{ code, mode: 'splice', warnings }`. It refuses a missing/blank source, any mode other than `splice`, and any parameter beyond `keymap`/`layout`/`originalSource` (template, JSON sidecar or other extra outputs). Do not widen it to templates, multi-file saves or host outputs.

Specification-only layer-operation probes live in `src/layer-operation-boundary.test.ts`, owned by CHG-003. They characterize existing seams, not shipped duplicate/reorder behavior. Expected-failure probes run with `it.fails` normally; `CHG003_RED=1` exposes their ordinary assertion failures for review. Do not count those probes as passing operation acceptance or implement their fixes outside the owning phase.

CHG-011's implemented core contracts are exercised in `src/upstream-source-boundary.test.ts`. `validateLayoutInfoJson` ignores named JSON without an own `layouts` member, keeps shared info validation strict, and attaches the adapter-supplied repository-relative path to `InfoValidationError` for invalid file metadata; present invalid layouts never become absence. `isPrimaryKeymapJson` requires matching non-override `holdTaps` codes for exact leading `&hm`/`&as` labels in raw binding strings across layers, `combos[].binding` and `sensorBindings`; same-label macros or behavior definitions do not satisfy this dependency. Preserve the stock catalog and existing unknown/other-label allowances, and keep Local's required-layout boundary distinct from GitHub inference.

CHG-008's specification-only layout corpus and acceptance contract live in `fixtures/layout-discovery/`, under its child DOX. `src/layout-discovery-boundary.test.ts` validates fixture integrity and characterizes existing load/write seams; it does not parse discovery metadata or certify proposed outcomes. Keep electrical coordinates separate from writer row/column ordering, and do not ship these synthetic fixtures as a board catalog.

`layout-discovery.ts` owns the closed literal metadata parser: exact transform aliases, chosen precedence, seven-cell physical attributes, declared EC11 sensor identity and complete split event coverage. Map order is binding order; electrical RCs/offsets stay separate from inferred writer slots. Limits are 256 KiB per document, 64 candidate nodes, 512 keys, 16 sensors and 1–255 matrix extents. Unknown properties, arbitrary includes, preprocessing, general overlays and expressions refuse discovery. Selected documents support only an unlabeled keymap root, bounded chosen references and single selected-transform offset assignments; other source constructs safely fall back rather than grant partial closure.

`layout-catalog.ts` compiles caller-supplied, already-resolved snapshots in memory; it does not fetch, open paths or resolve checkout/include graphs. Catalogs retain exact board/revision/shield/part identity, source/license attribution, source/output hashes and a content-addressed revision; sorted JSON and immutable captured inputs make regeneration deterministic. Exact stock preamble exceptions require pinned curator review evidence, not user include hints. Source/license/closure verification remains an offline curator responsibility; no real-board inventory or firmware compatibility certification is bundled. Rebuild serialized catalog inputs through `buildLayoutCatalog` before resolution.

`loadKeyboardBundle` accepts discovery only as an explicit domain-preview input; existing adapters do not automatically select or accept it. Valid explicit JSON wins without inspecting discovery; malformed geometry, unsafe serialization order and inconsistent layer counts error rather than repair. Preserve the legacy `{ layouts: {} }` absence case. Rejected discovery returns a reason and the binding-count rectangle without changing key/sensor bindings. `layout-discovery.test.ts` and `layout-catalog.test.ts` exercise the implementation and edited writer round trips; the Phase 1 boundary suite remains specification evidence. UI acceptance/provenance/export interaction and CAP promotion are separate work.

Keep schema-free helper preservation separate from declaration-aware operations. `src/layer-operations.test.ts` exercises the real operation API, source locality, strict refusal, append isolation and inverse permutations; do not count phase-1 expected-failure probes as operation acceptance. Preserve conditional sorting with duplicates and distinguish explicit full combo filters from global absent/empty filters.

CHG-005 owns the specification-only `fixtures/corpus/macro-boundary-*.keymap` inputs and `src/zmk-macros.ts`. The macro module parses only the bounded ZMK macro subset, preserves unsupported source as read-only diagnostics, keeps source offsets internal, and requires matching semantic source metadata before mutating a source-backed definition. `src/zmk-macros.test.ts` covers parsing, source locality, reference-safe deletion, lifecycle serialization, and US-ASCII conversion. The opaque fixture intentionally contains invalid definitions and unresolved dependencies; it must never grant authoring ownership.

CHG-006 owns `fixtures/corpus/behavior-boundary-*.keymap` inputs and the live bounded parser/splicer in `src/behavior-definitions.ts`. It supports only hold-tap, sticky-key/sticky-layer, tap-dance, mod-morph and sensor-rotate definitions; unsupported definitions and properties remain source-preserved and read-only. Keep hold-tap/sticky `bindings` as bare child phandles without argument cells; tap-dance/mod-morph/sensor-rotate use complete child invocations. Supported tuning values are decimal `uint` literals, the string `flavor` enum, or presence-only flags; expressions such as `(MOD_LSFT|MOD_RSFT)` belong only in the opaque input. Source-backed edits require the matching definition fingerprint and complete reference coverage; `buildKeymapCode` remains the only writer. The opaque fixture's file-level `#define EXPR_TERM` prevents complete closed-source coverage; never grant it authoring ownership or count it as isolated per-node diagnostic evidence. Coverage-clean variants isolate unsupported class diagnostics.

Macro splices revalidate every editable definition and all incoming sites of changed signatures, including transitive callers; opaque incoming calls cannot prove compatibility. New labels must not capture unresolved imported references. Only explicitly source-free generation may introduce definitions for its generated calls. Malformed macro-list members invalidate the whole managed list, never become an implicit deletion. Validate unforwarded `MACRO_PLACEHOLDER` as literal zero without rewriting source; modifier operands/wrappers require the explicit stock modifiers include.

Explicitly source-free mixed macro/behavior generation assembles both families and generated legacy hold-tap presets before graph validation; serial family validation falsely rejects valid cross-family calls. Reuse the existing formatters and require complete coverage, schema fingerprints and reference validation on that graph before appending the fixed RGB recipe/header. When appended, `generatedDefinitionSource` carries the pre-recipe graph for definition validation only; `code` remains the complete export. This internal default-template path never substitutes for source-backed splicing or grants ownership of stock overrides or opaque/imported source.

Managed source-free generation refuses unresolved definition references at the writer boundary, including key/combo/encoder sites. For source-free layer operations with the fixed RGB recipe, prove/splice the generated pre-recipe graph, use the owned recipe's parameter schema, and restore its header only after output proof. Never widen macro `ALLOWED_INCLUDES` or strip imported RGB source to grant definition ownership.

Source-backed managed macro saves compare a present source fingerprint even when the parsed source has no macros; externally deleted definitions must not be restored from stale metadata. An absent fingerprint remains valid for a first addition to macro-free source. Insert new definitions together in draft order at the verified `macros` container end, creating one container when absent; preserve exterior source bytes and line endings. Before returning a splice, require the full reparsed macro sequence fingerprint to match the managed draft, including order across `macros` and `behaviors`. Reject unrepresentable append/reorder/interleave requests with `KeymapValidationError`; never normalize JSON order or move existing source definitions to make the pair reloadable.

`textToUsAsciiMacro` returns an explicit no-change result for empty input or a new zero-parameter US ASCII tap proposal with editable 40ms timing defaults and the 24-character/48-entry queue explanation. `macroQueueWarnings` exposes advisory known-leaf counts per press/release activation segment; it does not simulate timing, queue draining or nested execution. General macro layer operations remain refused; the core regression checks transaction candidates and consumer-owned history snapshots, not browser history integration.

## Verification

From repository root: pnpm --filter @keymap-editor/keymap-core test; pnpm --filter @keymap-editor/keymap-core lint.

## Child DOX Index

| Child | Owns |
| --- | --- |
| `fixtures/layout-discovery/AGENTS.md` | CHG-008 synthetic metadata, proposed discovery acceptance and fixture evidence boundaries. |
