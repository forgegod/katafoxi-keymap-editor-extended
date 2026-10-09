# Documentation

## Purpose

Documentation.

## Ownership

Architecture, ADRs, deployment guides, and product/change records. Existing TARGET_SYSTEM.md remains the detailed product design; CAPs index test-backed outcomes, not a competing vision.

## Local Contracts

Keep architecture current. Preserve existing ADR identities; design-decisions.md indexes them. Separate proposed gaps from present behavior. Do not duplicate CHG progress in TARGET_SYSTEM.md.

## Work Guidance

Read product and change contracts before creating records or visuals. Deployment guides never contain secrets.

## Verification

Run pnpm records:check for records and applicable product tests for behavior claims.

## Child DOX Index

| Child | Owns |
| --- | --- |
| `product/AGENTS.md` | Current capabilities and canonical visuals. |
| `changes/AGENTS.md` | Planned work, phase progress, and review packages. |
