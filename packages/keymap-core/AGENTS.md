# Shared domain

## Purpose

Shared domain.

## Ownership

Firmware parse/splice/generate, binding catalogs, host layouts, composed legends, fixture data, and domain tests.

## Local Contracts

Pure domain code shared by browser and API. Preserve untouched source text; fail closed on unsupported ambiguous edits. No concrete keyboards in product logic. Keep keycapFace as the sole face-packing contract. Keep host registry synchronous.

`repository-keymap.ts` owns exact selected-path validation, deterministic legacy/scoped sidecar paths and host-reference compatibility. Never normalize an unsafe path into an allowed identity or resolve missing repository user tables through the browser-global registry. Adapters prove pinned-tree ownership and permissions before using these pure rules.

JSON validation and primary-source detection retain `&reset` as an exact legacy import label, separate from the stock picker catalog, docs links, and role ordering. Preserve its token and opaque arguments; never rewrite it to `&sys_reset` or infer a schema. Other unknown labels still require the existing explicit source-import option or declared-model allowance.

`operateLayers` owns immutable duplicate/reorder preflight and transforms; `layer-operation-source.ts` owns its closed source subset and logical node moves. Require actual source plus matching baseline, or positively source-free provenance; templates and unknown save paths reject. Derive layer slots from verified forwarding definitions, not UI hints or recursive numeric-token searches. Canonical recipes also require unoverridden dependencies. Plain save/delete helpers retain their existing contracts.

## Work Guidance

Add focused round-trip and locality tests for file transformations. Preserve unknown external binding parameters. ZMK macros are not C preprocessor aliases. Demo boards belong in fixtures.

Specification-only layer-operation probes live in `src/layer-operation-boundary.test.ts`, owned by CHG-003. They characterize existing seams, not shipped duplicate/reorder behavior. Expected-failure probes run with `it.fails` normally; `CHG003_RED=1` exposes their ordinary assertion failures for review. Do not count those probes as passing operation acceptance or implement their fixes outside the owning phase.

Keep schema-free helper preservation separate from declaration-aware operations. `src/layer-operations.test.ts` exercises the real operation API, source locality, strict refusal, append isolation and inverse permutations; do not count phase-1 expected-failure probes as operation acceptance. Preserve conditional sorting with duplicates and distinguish explicit full combo filters from global absent/empty filters.

CHG-005 owns the specification-only `fixtures/corpus/macro-boundary-*.keymap` inputs and `src/zmk-macros.ts`. The macro module parses only the bounded ZMK macro subset, preserves unsupported source as read-only diagnostics, keeps source offsets internal, and requires matching semantic source metadata before mutating a source-backed definition. `src/zmk-macros.test.ts` covers parsing, source locality, reference-safe deletion, lifecycle serialization, and US-ASCII conversion. The opaque fixture intentionally contains invalid definitions and unresolved dependencies; it must never grant authoring ownership.

CHG-006 owns the specification-only `fixtures/corpus/behavior-boundary-*.keymap` inputs. They describe the intended editable schemas for hold-tap, sticky-key/sticky-layer, tap-dance, mod-morph and sensor-rotate plus intentionally opaque definitions and property classes. Keep hold-tap/sticky `bindings` as bare child phandles without argument cells; tap-dance/mod-morph/sensor-rotate use complete child invocations. Supported tuning values are decimal `uint` literals, the string `flavor` enum, or presence-only flags; expressions such as `(MOD_LSFT|MOD_RSFT)` belong only in the opaque input. `expect: splice` proves existing source preservation, not behavior-definition editability. The opaque fixture's file-level `#define EXPR_TERM` prevents complete closed-source coverage; never grant it authoring ownership or count it as isolated per-node diagnostic evidence. B11 requires Phase-2 coverage-clean variants without that define.

Macro splices revalidate every editable definition and all incoming sites of changed signatures, including transitive callers; opaque incoming calls cannot prove compatibility. New labels must not capture unresolved imported references. Only explicitly source-free generation may introduce definitions for its generated calls. Malformed macro-list members invalidate the whole managed list, never become an implicit deletion. Validate unforwarded `MACRO_PLACEHOLDER` as literal zero without rewriting source; modifier operands/wrappers require the explicit stock modifiers include.

Source-backed managed macro saves compare a present source fingerprint even when the parsed source has no macros; externally deleted definitions must not be restored from stale metadata. An absent fingerprint remains valid for a first addition to macro-free source. Insert new definitions together in draft order at the verified `macros` container end, creating one container when absent; preserve exterior source bytes and line endings. Before returning a splice, require the full reparsed macro sequence fingerprint to match the managed draft, including order across `macros` and `behaviors`. Reject unrepresentable append/reorder/interleave requests with `KeymapValidationError`; never normalize JSON order or move existing source definitions to make the pair reloadable.

`textToUsAsciiMacro` returns an explicit no-change result for empty input or a new zero-parameter US ASCII tap proposal with editable 40ms timing defaults and the 24-character/48-entry queue explanation. `macroQueueWarnings` exposes advisory known-leaf counts per press/release activation segment; it does not simulate timing, queue draining or nested execution. General macro layer operations remain refused; the core regression checks transaction candidates and consumer-owned history snapshots, not browser history integration.

## Verification

From repository root: pnpm --filter @keymap-editor/keymap-core test; pnpm --filter @keymap-editor/keymap-core lint.

## Child DOX Index

None.
