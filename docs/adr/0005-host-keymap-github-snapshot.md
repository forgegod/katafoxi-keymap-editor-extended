# ADR 0005: Host keymap snapshot in the GitHub repo

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The composed editor treats ZMK bindings and host layouts as one meaning on the
board, but persistence was split: firmware lived in the GitHub commit, while
user host layouts and the legend view lived only in IndexedDB. Checking out a
commit, switching branches, or opening the same repo on another machine restored
ZMK and not the host half. That broke the GitHub iteration model: one edit cycle
→ one commit → one recoverable total result.

[ADR 0001](0001-persistence-github-first.md) already named future host artifacts
beside ZMK config. [ADR 0004](0004-host-edit-and-os-deliverables.md) keeps Host
**Changed** as “ready to install on the OS,” which is not the same as
“uncommitted to the repo.” Those two meanings must stay separate.

## Decision

### Product unit on GitHub

For `source = github`, a **Commit** publishes one git commit that can include:

1. ZMK files as today (`config/*.keymap`, `config/keymap.json`) per [ADR 0002](0002-keymap-file-contract.md).
2. A **host snapshot** at `host_keymap/snapshot.json` (repo root, sibling of `config/`).

Firmware CI must not require host files. OS install (Linux / Windows) stays the
Host chrome lane; there is no single “flash MCU and install Windows” button.

Demo and Clipboard stay browser-local for host data. Dev-local may adopt the
same file later; this ADR only requires the GitHub path.

### File contract (`keymap-core`)

| Piece | Role |
|-------|------|
| Path | `host_keymap/snapshot.json` |
| `version` | `1` |
| `view` | `HostLegendView` (`columns`, `open`, optional `keycap`) |
| `layouts` | User layout tables referenced by `view` (`user:…` only). System ids stay pointers in `view`. |

Each layout row: `id`, `name`, `language`, `origin` (`copy` / `xkb` / `klc`), and
`keys[]` with `zmk`, four `keysyms`, four `glyphs` (same shape as IndexedDB).

Encode/parse live in `packages/keymap-core`. The API and SPA do not invent a
second schema.

### OS install deliverables (same Commit)

Beside the snapshot, Commit also writes **generated** install files so a user
can download them from the repo after an OS reinstall without opening the
editor. Snapshot stays the editor source of truth; deliverables are derived and
must not be hand-edited as the round-trip path.

| Path | When | Content |
|------|------|---------|
| `host_keymap/linux/<lang>.xkb` | Column is a **user** layout | `xkb_symbols` section (UTF-8) |
| `host_keymap/windows/<lang>.klc` | Column is a **user** layout | One-language MSKLC source (UTF-8 text, CRLF) |
| `host_keymap/windows/en-<lang>.klc` | English column + that language on the board | Combined Caps Lock file (`hostLayoutsToCapsKlc`, `pairedKbdId` version `1`) |

- Built in core (`buildHostKeymapDeliverableFiles`) from the live legend + layout
  tables; the SPA sends them with the Commit body; the API writes the blobs.
- UTF-8 `.klc` text in git is intentional (reviewable, lightweight). The Host
  lane still downloads UTF-16 LE with BOM for MSKLC when installing now.
- Firmware CI must ignore `host_keymap/` entirely.
- Orphan deliverables from a removed language may remain until a later manual
  cleanup; this ADR does not delete paths from the tree.

### Commit

- The SPA builds the current snapshot **and** current host deliverable files from
  the live legend + registered layouts and sends both with the keyboard-files
  POST body.
- Every Commit that includes a snapshot writes/updates `host_keymap/snapshot.json`
  and the matching `linux/` / `windows/` deliverables in the same git tree as
  the ZMK files.
- Commit is enabled when the ZMK draft is dirty **or** the live host snapshot
  differs from the last loaded/committed repo baseline (`isHostRepoDirty`).
- Default Commit always closes out dirty host together with ZMK when both (or
  only host) need publishing. There is no “firmware only” checkbox in this ADR.

### Load

- `GET` keyboard-files returns `hostSnapshot` when the file exists and parses;
  otherwise `hostSnapshot: null` (missing file is normal for older repos).
- When `hostSnapshot` is present, it **wins** over IndexedDB for that
  repo/branch/keyboard: register layouts, set the legend view, mirror into
  IndexedDB as cache.
- When absent, keep today’s IndexedDB restore for that identity.
- IndexedDB remains draft/offline cache and the SoT for Demo / non-GitHub
  sources. After a successful GitHub Commit or Load-with-snapshot, the repo is
  SoT until the user edits again.

### Chrome meanings

| Signal | Meaning |
|--------|---------|
| ZMK **Draft** / Commit ready | Unpublished ZMK **and/or** host snapshot vs repo baseline |
| Host **Changed** / **Saved** / **Ready** | OS install lane only ([ADR 0004](0004-host-edit-and-os-deliverables.md)); not git dirty |

### Assemblies

Remembered assembly chips stay IndexedDB-only in this ADR. The snapshot covers
the live legend view and the layout tables it points at.

## CHG-004 amendment — owned snapshots and safe omission

This amendment records the operator-approved persistence/recovery boundary for
CHG-004; the original acceptance date remains unchanged. API enforcement and
identity plumbing precede the separately reviewed picker and destructive recovery
UI. The following rules supersede shared-path/invalid-load defaults above for
selected GitHub files, not for Demo, Clipboard or Local.

- Ownership mode follows ADR 0002. Legacy mode retains `host_keymap/`. Scoped
  mode owns only `host_keymap/keymaps/<full-keymap-filename>/`, containing
  `snapshot.json`, `linux/<lang>.xkb`, `windows/<lang>.klc` and
  `windows/en-<lang>.klc`. Legacy and other files' roots remain untouched; no
  cleanup deletes orphan deliverables. The snapshot schema remains version 1.
- Reads distinguish missing, compatible, invalid, unsupported version and
  ownership/reference incompatibility. An existing empty/corrupt snapshot is
  invalid, not missing. Transport/access failure is a failed load. References
  must resolve from snapshot-owned user tables or the core system registry.
  Without an owned snapshot, an existing legacy snapshot in scoped mode is
  incompatible, not absent; its contents cannot seed the selected file.
- At the pinned write base the server independently rechecks ownership and the
  remote snapshot. Invalid, unsupported or incompatible remote state omits ALL
  snapshot and install-file writes, even when the caller supplies replacements.
  Firmware may still commit after its own ownership/consent checks. Omission is
  returned explicitly and cannot be interpreted as host publication. A missing
  owned snapshot with no ambiguous legacy snapshot may be initialized normally.
- Compatible owned host work remains co-committed with firmware, including after
  a valid per-file firmware JSON choice. Host deliverable input uses the core
  legacy-shaped logical paths, which the server validates without normalization
  and maps beneath the selected root. No caller-selected root is authoritative.
- GitHub same-identity Reload/reopen preserves unpublished firmware and host
  recovery, with original publish provenance if the remote base changed. A
  firmware-only receipt accepts only sent firmware, never local host recovery.
  Publishable host dirtiness and browser-local host recovery are distinct.
- Retain a last verified compatible host baseline (view/tables/identity/SHA)
  separately from mutable recovery. A clean compatible-to-invalid/unsupported
  load retains that origin without manufacturing dirty work. Only absence of a
  verified baseline permits standard English fallback; a completed explicit reset
  takes precedence over historical baselines. Identity-owned host tables must
  not overwrite other identities or global profiles.
- Pending phase-3 interaction: omitted writes keep host edits usable but
  explicitly browser-local and unpublishable. Same-keymap Reload is not discard.
  Confirmed `Discard local host edits` atomically resets only the named identity's
  host working/recovery records to standard English, preserving firmware and
  remote files. Cancellation/failure preserves recovery. This action is required
  before transitions only when omitted writes coexist with local host work, not
  for clean sessions or after compatible publication. Firmware protection is
  independent. Full transaction/transition oracles remain in active CHG-004.
- A deliberate Create-branch carry validates the same selected file and copied
  baseline. Under omission with no host work it carries firmware only, not source
  host recovery or historical host origin. Ordinary branch selection never
  migrates drafts. GitHub keep-on-decline recovery does not change non-GitHub
  decline-discards-firmware behavior.

## Consequences

### Positive

- Branch/SHA restore recovers composed meaning, not only firmware text.
- GitHub-first persistence stays file-based; no host SoT on the API disk.
- One core contract for any later Clipboard/File System Access host export.

### Negative / trade-offs

- Public `zmk-config` repos publish the user’s host layout tables and install
  sources.
- Commits grow a non-firmware path; CI must ignore it.
- Repos without a snapshot still rely on IndexedDB until the first Commit that
  writes one.
- Assemblies are not versioned with the commit yet.
- Deliverable files can orphan when a language is removed (no tree delete yet).
- Git `.klc` is UTF-8 text; some MSKLC workflows still prefer UTF-16 download
  from the Host lane.

## Related

- [TARGET_SYSTEM.md](../TARGET_SYSTEM.md)
- [0001](0001-persistence-github-first.md) — GitHub-first; host artifacts beside ZMK
- [0002](0002-keymap-file-contract.md) — ZMK save paths
- [0004](0004-host-edit-and-os-deliverables.md) — Host OS install lane
