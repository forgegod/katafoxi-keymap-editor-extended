# Current product records

## Purpose

Current product records.

## Ownership

README.md, index.md, capabilities/, and the wireframe child.

## Local Contracts

CAPs describe existing behavior only, with implementation and behavior-test paths. Use partial for bounded implementations, never to claim a planned feature. Every primary human surface requires a canonical generated HTML/PNG pair.

## Work Guidance

Read README.md and ../changes/README.md. The generator is the only screen-definition source; proposed interactions remain with their CHG.

CAP-001 owns the bounded Macros and Behaviors dialogs and their canonical firmware-editor schematic. Keep Demo/verified-Clipboard authoring distinct from source preservation, and separate tested UI outcomes from core-only coverage. Behaviors distinguishes global properties, per-invocation operands, existing whole encoder slots and source-preview Apply; stock overrides remain coverage-restricted. CHG-005's full M01–M12 acceptance matrix remains uncertified; its closure does not expand CAP-001's implemented boundary.

## Verification

Run pnpm records:check; generate and render visuals and inspect changed screens. Run the linked behavior tests.

## Child DOX Index

| Child | Owns |
| --- | --- |
| `wireframes/AGENTS.md` | Canonical generator, manifest, HTML and PNG exports. |
