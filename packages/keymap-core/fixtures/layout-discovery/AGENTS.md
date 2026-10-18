# Layout discovery specification fixtures

## Purpose

Synthetic inputs and acceptance contract for CHG-008's bounded ZMK metadata discovery.

## Ownership

This directory owns the fixture contract, proposed regression matrix and synthetic metadata. `../../src/layout-discovery-boundary.test.ts` owns executable characterization of existing core seams. The active CHG-008 alone owns progress.

## Local Contracts

- Specification evidence only: these files are not a shipped catalog, parser or current CAP behavior.
- Keep positive metadata, isolated negative mutations and expected logical ordering attributable and deterministic. Never fetch includes or interpret fixture expressions.
- Label proposed discovery outcomes separately from assertions exercised against existing code. Do not use fake failures or fixture-integrity checks as discovery acceptance.

## Work Guidance

Read `README.md` before changing cases. Keep metadata positions separate from writer row/column ordering, and sensors separate from key counts. Synthetic names do not grant firmware compatibility or measured geometry.

Keep the stock non-metadata keymap preamble distinct from unproved metadata includes; test selected-keymap includes as well as metadata-file includes without following either. An absent optional sensor node retains valid candidate geometry with no declared sensor labels and unverified association; a present node missing its required property invalidates metadata and discards the candidate for safe rectangular fallback. Both preserve raw firmware sensor slots. Physical-width oracles carry equal `w`/`u` values and verify bundle/layout-JSON retention, not only `validateInfoJson` acceptance.

## Verification

From repository root: `pnpm --filter @keymap-editor/keymap-core test -- src/layout-discovery-boundary.test.ts src/keyboard-bundle.test.ts src/layout.test.ts`; `pnpm records:check`.

## Child DOX Index

None.
