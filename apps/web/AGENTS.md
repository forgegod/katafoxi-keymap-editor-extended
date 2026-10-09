# Browser editor

## Purpose

Browser editor.

## Ownership

Svelte components, reactive editor state, source pickers, draft/host storage, and component tests.

## Local Contracts

Keep ZMK parsing and file generation in keymap-core. Plain click edits ZMK; Alt+click edits host glyphs. UI chrome is English. Preserve accessibility, stale-load guards, draft identity, and separate firmware/host dirty state.

## Work Guidance

Follow root keycapFace and CSS-sidecar rules. Pair material interaction changes with CAP tests and canonical wireframes.

## Verification

From repository root: pnpm --filter @keymap-editor/web test; pnpm --filter @keymap-editor/web lint. Use Node 24 LTS for verification; Node 26 currently causes happy-dom storage failures.

## Child DOX Index

None.
