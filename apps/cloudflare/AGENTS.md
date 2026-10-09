# Managed hosting adapter

## Purpose

Managed hosting adapter.

## Ownership

Worker/container routing and configuration, not a second editor implementation.

## Local Contracts

Use the same Hono API and built SPA. Keep credentials in runtime secrets. No deployment or account changes without an explicit operator request.

## Work Guidance

Follow docs/deploy-cloudflare.md. Do not confuse dry-run/build verification with a live deployment.

## Verification

From repository root: pnpm --filter @keymap-editor/cloudflare test; pnpm --filter @keymap-editor/cloudflare lint.

## Child DOX Index

None.
