# Shared domain

## Purpose

Shared domain.

## Ownership

Firmware parse/splice/generate, binding catalogs, host layouts, composed legends, fixture data, and domain tests.

## Local Contracts

Pure domain code shared by browser and API. Preserve untouched source text; fail closed on unsupported ambiguous edits. No concrete keyboards in product logic. Keep keycapFace as the sole face-packing contract. Keep host registry synchronous.

## Work Guidance

Add focused round-trip and locality tests for file transformations. Preserve unknown external binding parameters. ZMK macros are not C preprocessor aliases. Demo boards belong in fixtures.

## Verification

From repository root: pnpm --filter @keymap-editor/keymap-core test; pnpm --filter @keymap-editor/keymap-core lint.

## Child DOX Index

None.
