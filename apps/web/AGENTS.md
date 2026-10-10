# Browser editor

## Purpose

Browser editor.

## Ownership

Svelte components, reactive editor state, source pickers, draft/host storage, and component tests.

## Local Contracts

Keep ZMK parsing and file generation in keymap-core. Plain click edits ZMK; Alt+click edits host glyphs. UI chrome is English. Preserve accessibility, stale-load guards, draft identity, and separate firmware/host dirty state. Arm beforeunload only while firmware is dirty or a GitHub host snapshot is unpublished; host-install status does not arm it. Keep pagehide and visibilitychange draft flushing independent of that guard.

## Work Guidance

Follow root keycapFace and CSS-sidecar rules. Pair material interaction changes with CAP tests and canonical wireframes.

Capture the sent document before async publish/copy I/O. Accept only that baseline and preserve newer edits; session-generation guards also own saving-lock cleanup. Export-sheet retries accept the sheet's captured document, never the current draft.

## Verification

From repository root: pnpm --filter @keymap-editor/web test; pnpm --filter @keymap-editor/web lint. Use Node 24 LTS for verification; Node 26 currently causes happy-dom storage failures.

## Child DOX Index

None.
