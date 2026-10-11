# Shared domain

## Purpose

Shared domain.

## Ownership

Firmware parse/splice/generate, binding catalogs, host layouts, composed legends, fixture data, and domain tests.

## Local Contracts

Pure domain code shared by browser and API. Preserve untouched source text; fail closed on unsupported ambiguous edits. No concrete keyboards in product logic. Keep keycapFace as the sole face-packing contract. Keep host registry synchronous.

JSON validation and primary-source detection retain `&reset` as an exact legacy import label, separate from the stock picker catalog, docs links, and role ordering. Preserve its token and opaque arguments; never rewrite it to `&sys_reset` or infer a schema. Other unknown labels still require the existing explicit source-import option or declared-model allowance.

## Work Guidance

Add focused round-trip and locality tests for file transformations. Preserve unknown external binding parameters. ZMK macros are not C preprocessor aliases. Demo boards belong in fixtures.

Specification-only layer-operation probes live in `src/layer-operation-boundary.test.ts`, owned by CHG-003. They characterize existing seams, not shipped duplicate/reorder behavior. Expected-failure probes run with `it.fails` normally; `CHG003_RED=1` exposes their ordinary assertion failures for review. Do not count those probes as passing operation acceptance or implement their fixes outside the owning phase.

Keep schema-free helper preservation separate from future declaration-aware remapping. Characterize existing conditional sorting (duplicates retained), global combo filters, and source-loss boundaries without changing serializers to satisfy proposed operation oracles.

## Verification

From repository root: pnpm --filter @keymap-editor/keymap-core test; pnpm --filter @keymap-editor/keymap-core lint.

## Child DOX Index

None.
