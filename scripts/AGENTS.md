# Development and maintenance automation

## Purpose

Development and maintenance automation.

## Ownership

Dev-server orchestration, catalog refresh, record validation, and documentation verification scripts/tests.

## Local Contracts

Keep record validation dependency-free and credential-free. Tests use disposable fixtures, not sibling checkouts. Preserve application scripts; do not copy blueprint-specific proof or skill-installation tests.

## Work Guidance

Read the manifest and applicable docs contracts before changing a script. No network required by record checks. Generated visuals are owned by docs/product/wireframes.

## Verification

Use the root records:check and test:records commands for adopted validation. Existing dev scripts remain verified by application gates.

## Child DOX Index

None.
