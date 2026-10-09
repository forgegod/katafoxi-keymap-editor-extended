# Architecture

## Product goal

Help ZMK keyboard users edit firmware bindings and understand the characters their host layout produces. The product is a browser editor, not a firmware compiler or OS layout installer.

## Runtime boundaries

| Boundary | Responsibility |
| --- | --- |
| `apps/web` | Svelte 5/Vite editor, source pickers, draft recovery, host editing, and downloads. |
| `packages/keymap-core` | Shared TypeScript catalogs, firmware parse/splice/generate, combos, conditional layers, hold-taps, sensor bindings, host registry, composition, xkb/KLC and snapshot formats. |
| `apps/api` | Hono GitHub OAuth/App sessions and repository persistence; optional development-only local adapter. |
| `apps/cloudflare` | Worker/container adapter hosting the same API and SPA. |
| `e2e` | Browser verification using fixture keymaps and mocked GitHub services, plus production/static smoke. |

The browser owns the interactive draft. Domain transformations stay in core; adapters do not invent another serializer. The API owns authentication secrets, not editor presentation.

## Persistence and security

- GitHub is the primary product persistence path. Commits can include firmware and the host snapshot/deliverables together. Reads are pinned to a head SHA and stale writes are rejected.
- Browser IndexedDB stores draft/cache state and host layouts. Demo is browser-only; Clipboard imports/exports firmware text manually. Host edits are not ZMK undo history.
- Local server filesystem access is an opt-in development adapter. Browser File System Access is not implemented.
- GitHub uses opaque server sessions with an HttpOnly cookie. Preserve OAuth state validation, repository access checks, origin guards, request limits, and secret-free logging.
- Static Pages enables Demo and Clipboard, not GitHub login or the local server adapter. The full SPA/API deployment supports GitHub when configured.

Detailed contracts remain in [ADRs](adr/README.md), [TARGET_SYSTEM](TARGET_SYSTEM.md), and [deployment guides](deploy-cloudflare.md).

## Source preservation and limits

The shared save contract chooses a supplied template, an existing-source splice, or a noisy default-template fallback. Preserve untouched source and reject ambiguous edits rather than guessing. Existing opaque behavior parameters survive import/edit/export; that is not a general behavior-definition editor. C preprocessor aliases and ZMK macro behaviors are distinct.

Current user-visible outcomes and bounded gaps are indexed by [capabilities](product/index.md). Planned parity features are tracked only in [active changes](changes/README.md).

## Maintenance structure

- Root and child AGENTS.md files form DOX ownership contracts.
- CAPs state current behavior and link executable tests; CHGs own progress for requested material changes. Neither replaces runtime/security/ADR contracts.
- Human-facing CAPs have canonical generated HTML/PNG schematics. Review-only proposals remain in their owning CHG package.
- The dependency-free record validator and generic fixture tests are adapted from AI Software Blueprint revision `f6f5a558f48fe10daddb740f866d37b0ca06e098`. Blueprint demonstration CAPs/CHGs, skill-hosting tests, package configuration, and runtime-neutral claims are not adopted.
- Optional skills remain externally installed aids. Validation and normal development need no sibling blueprint checkout or skill installation.

## Non-goals

No stack migration, general-purpose filesystem server, in-app firmware compilation, multiplayer editing, or wholesale DTS AST rewrite is authorized by maintenance adoption. Proposed changes that require a durable architecture fork must record and obtain approval for it before implementation.
