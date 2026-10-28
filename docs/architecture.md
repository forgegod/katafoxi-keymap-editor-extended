# Architecture

## Product goal

Help ZMK keyboard users edit firmware bindings and understand the characters their host layout produces. The product is a browser editor, not a firmware compiler or OS layout installer.

## Runtime boundaries

| Boundary | Responsibility |
| --- | --- |
| `apps/web` | Svelte 5/Vite editor, source pickers, draft recovery, host editing, and downloads. |
| `packages/keymap-core` | Shared TypeScript catalogs, firmware parse/splice/generate, bounded macro definitions/references, combos, conditional layers, hold-taps, sensor bindings, host registry, composition, xkb/KLC and snapshot formats. |
| `apps/api` | Hono GitHub OAuth/App sessions and repository persistence; optional development-only local adapter. |
| `apps/cloudflare` | Worker/container adapter hosting the same API and SPA. |
| `e2e` | Browser verification using fixture keymaps and mocked GitHub services, plus production/static smoke. |

The browser owns the interactive draft. Domain transformations stay in core; adapters do not invent another serializer. The API owns authentication secrets, not editor presentation.

The browser MacroPanel stages interaction; `macro-editor.ts` captures and confirms core-generated previews against the same document/source revision. Clipboard macro transactions reuse document history/recovery snapshots to retain matching source and semantics. Authoring is limited to Demo and verified Clipboard; persistence adapters gain no new authoring API.

## Persistence and security

- GitHub is the primary product persistence path. Commits can include firmware and the host snapshot/deliverables together. Reads are pinned to a head SHA and stale writes are rejected.
- GitHub file identity is repository/branch/exact config path. A complete pinned tree and durable scoped marker establish sidecar ownership; server-side omission leaves invalid, unsupported or ambiguous host outputs untouched. Selected browser recovery keeps immutable provenance separate from working state, with transaction-time conflict checks. Firmware and host databases are not one atomic transaction. The selected-file picker and destructive host-recovery UI are implemented; see [CAP-002](product/capabilities/CAP-002-keymap-sources-and-persistence.md), [CAP-003](product/capabilities/CAP-003-host-layouts-and-legends.md), and the concise completed-phase evidence in [CHG-004](changes/active/CHG-004-select-keymap-file-within-repository.md).
- Browser IndexedDB stores draft/cache state and host layouts. Demo is browser-only; Clipboard imports/exports firmware text manually. Host edits are not ZMK undo history.
- Local server filesystem access is an opt-in development adapter. The separate browser Filesystem source reads one existing raw `.keymap`; folder grants discover direct entries read-only. Save reselects the exact existing firmware file with a fresh file picker, proves handle identity and baseline bytes, and writes only core's source-preserving splice output. Geometry is validated read-only input. Sidecars, templates, markers and host files are not browser write targets.
- Filesystem handles remain session-local by default; explicit remembering stores them in their own origin-local IndexedDB database, separate from transferable firmware baseline/draft/attempt recovery. No filesystem handle, opaque identity or route metadata enters API/GitHub requests, host snapshots or exported firmware. Forgetting handles neither deletes recovery nor revokes browser/OS permission. Cleared browser storage cannot be recovered by the app.
- Filesystem permission prompts and disk operations require explicit controls, never startup/lifecycle prompts. A retained uncertain attempt blocks ordinary editing/Save; Restore restores only the draft, and explicit Reconcile save proves current identity and original/intended bytes without rewriting. Browser recovery is not publication or guaranteed durability. Full-byte checks do not provide an external-editor lock, compare-and-swap or a multi-file transaction.
- GitHub uses opaque server sessions with an HttpOnly cookie. Preserve OAuth state validation, repository access checks, origin guards, request limits, and secret-free logging.
- Static Pages enables Demo, Clipboard and capability-gated browser Filesystem/USB controls, not GitHub login or the local server adapter. File and folder pickers are independently gated on secure context and callable APIs; unsupported routes retain explicit Clipboard guidance, never a server fallback. USB requires Web Serial support, a secure context and an unlocked compatible RPC session; it changes keyboard settings, not files, and adds no browser firmware-draft persistence or persistence API. The full SPA/API deployment supports GitHub when configured.

Detailed contracts remain in [ADRs](adr/README.md), [TARGET_SYSTEM](TARGET_SYSTEM.md), and [deployment guides](deploy-cloudflare.md).

## Source preservation and limits

Layout discovery uses core's bounded literal-metadata parser/catalog resolver. Clipboard/GitHub keep explicit geometry precedence and the editable rectangle fallback; the browser accepts session geometry only after a source-bound preview and acknowledgement. GitHub supplies optional raw selected source at the pinned head. Imported catalog artifacts are offline curator inputs, not a bundled board inventory or remotely resolved includes. Export is a separate validated JSON download; no persistence adapter gains geometry writes. Current interaction and trust limits are in CAP-001/002.

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
