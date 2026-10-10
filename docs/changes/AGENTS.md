# Change execution records

## Purpose

Change execution records.

## Ownership

README.md, active/, archive/, and optional reviews/CHG-<number>/ packages.

## Local Contracts

One active CHG owns each material request scope. Use the exact request, baseline, impacted current CAPs, numbered phases, and executable gates. Planned phases are pending. Only verified work becomes done; only integrated changes are archived.

## Work Guidance

Read README.md and ../product/README.md. No private competing plan. Keep review assets outside active/archive and out of product capability links.

For each verified phase, freeze the exact diff and gate evidence before independent review. Implementation uses Astra with approval bypass enabled; review starts with `/new`, then `/model grok`. Never review a moving diff. Return active-phase findings to implementation, rerun verification, and repeat a fresh Grok review. Route independent improvements into a focused CHG. After approval, use the git-commit-message skill with the root commit policy and stop at its per-batch preview/apply boundary; do not stage, commit, or push implicitly. If the worker cannot control live-session commands, hand off the frozen fingerprint and evidence to the operator rather than claiming a model switch or review.

## Verification

Run pnpm records:check and the phase-specific gates. Closure requires current CAPs, visuals, behavior tests, and the integration gate.

## Child DOX Index

None.
