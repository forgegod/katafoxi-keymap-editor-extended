# Persistence and authentication API

## Purpose

Persistence and authentication API.

## Ownership

Hono routes, GitHub services, sessions, and optional local adapter.

## Local Contracts

OAuth credentials remain server-side; browser receives HttpOnly sid. Preserve state verification, origin checks, repository permissions, bounded requests, and stale-commit rejection. Local I/O is development-only, never a general file server.

## Work Guidance

Share file contracts through keymap-core. Never log credentials or overwrite unrelated repository files. Mock GitHub in tests; do not test against user repositories.

## Verification

From repository root: pnpm --filter @keymap-editor/api test; pnpm --filter @keymap-editor/api lint.

## Child DOX Index

None.
