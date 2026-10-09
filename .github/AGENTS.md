# Repository automation

## Purpose

Repository automation.

## Ownership

CI and Pages workflows; no hosted secrets in repository files.

## Local Contracts

Keep contents: read as the default. Add record validation to existing gates rather than replacing product tests. Pull requests must not deploy. Rendering uses installed Playwright Chromium; no new browser dependency is needed.

## Work Guidance

Preserve existing release behavior and build flags. Workflow edits do not authorize dispatch, deployment, or commits.

## Verification

Run the workflow commands locally where credential-free; report unrun hosted steps honestly.

## Child DOX Index

None.
