# Persistence and authentication API

## Purpose

Persistence and authentication API.

## Ownership

Hono routes, GitHub services, sessions, and optional local adapter.

## Local Contracts

OAuth credentials remain server-side; browser receives HttpOnly sid. Preserve state verification, origin checks, repository permissions, bounded requests, and stale-commit rejection. Local I/O is development-only, never a general file server.

Selected GitHub files require exact regular-blob membership in a complete pinned tree. Use core's paths and ADR 0002's durable ownership marker; unknown mode refuses writes. Never fall back from a vanished selection. Recheck remote host ownership/schema at the write base and omit every host output for invalid, unsupported or incompatible snapshots; return omission in the receipt. A listed but unreadable blob is not a missing-file initialization opportunity.

## Work Guidance

When geometry is absent, the GitHub load response may supply the selected raw `.keymap` at the same pinned head for browser discovery. Failed optional source reads disable discovery, not usable JSON-first editing. Never substitute generated firmware, follow metadata includes, or expand the commit write set to geometry.

Share file contracts through keymap-core. Never log credentials or overwrite unrelated repository files. Mock GitHub in tests; do not test against user repositories.

## Verification

From repository root: pnpm --filter @keymap-editor/api test; pnpm --filter @keymap-editor/api lint.

## Child DOX Index

None.
