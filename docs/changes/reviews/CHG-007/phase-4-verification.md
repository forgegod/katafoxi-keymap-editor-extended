# CHG-007 Phase 4 verification

**Status:** review-only
**Role:** Phase 4 implementer; verification evidence, not independent approval.
**Verified revision:** `79c517ee5c6f1670c7f295cb08b26252f589a3d7` on `main` in `/home/raphael/src/katafoxi-keymap-editor-extended`.
**Gate interval:** 2026-10-17T23:54:55+02:00 through 2026-10-18T00:00:31+02:00.
**Owner:** [Archived CHG-007](../../archive/CHG-007-browser-filesystem-keymap-source.md).

## Scope and lifecycle boundary

- Documentation/status only: the active CHG and this receipt. The checkout and index were clean at entry. Only Phase 4 was changed from pending to in-progress before running the gate; Phases 1–3 remain done and the CHG remains active/in-progress.
- The exact gate below ran on the actual main checkout, not a worktree or another candidate. No product implementation, behavior, keymap fixture, CAP, manifest, generator or test definition was edited. Regeneration reproduced every canonical HTML/PNG, manifest and index byte-for-byte against HEAD.
- This is a frozen verification handoff for fresh independent review under `docs/changes/AGENTS.md`, not a Phase 4 completion or closure receipt. No phase/CHG done transition, archive/move, change-index edit, next phase, staging, commit, push or deployment is authorized by this record.
- Prior [Phase 2 review](phase-2-final-autonomous-review.md), [Phase 3 review](phase-3-final-autonomous-review.md) and [permission CTA review](phase-3-permission-cta-review.md) were read. They approve their respective earlier slices only, not this record.

## Environment and isolation

- Linux `6.18.54.1-microsoft-standard-WSL2`, `x86_64`, GNU/Linux (WSL2).
- Node `v24.21.0`, matching `.nvmrc`; pnpm `9.15.0`, matching the repository pin. Playwright `1.63.0`; bundled Chromium `153.0.8010.12`. Vite build output reports `6.4.3`; Vitest reports `2.1.9`.
- Canonical renders and the supplementary DOM inspection used headless Chromium, device scale factor 1, dark color scheme and each manifest viewport, with HTTP(S) asset requests blocked. Browser test configurations use Chromium, one worker, zero retries and a 1600×1000 viewport.
- Gate logs and disposable files were isolated under `/home/raphael/.hermes/profiles/hermes-dev-exec/cache/scratch/chg007-phase4.sX4bt1/`. `E2E_ZMK_CONFIG` was explicitly set to its fresh `e2e-zmk-config` child. The suite copied vendored fixtures there; teardown removed that fixture root, confirmed afterward. No real user file or native picker was used in this run.
- `PAGES_TEST_URL`, `ZMK_CONFIG_PATH`, `E2E_API_PORT`, `E2E_WEB_PORT`, `E2E_PROD_PORT`, `E2E_PAGES_PORT` and `PAGES_BASE_PATH` were unset for the gate. Pages used the local static preview, not a deployment. Development e2e used its isolated fixture-backed local adapter and mocked GitHub; production smoke disabled GitHub and Local. No credential operation or real GitHub publication was performed.
- Generated builds, browser-test outputs and scratch logs are verification byproducts, not additions to the reviewed source diff. The final Pages command rebuilds the ignored web distribution for `/pages-preview/`; this is not a deployment artifact approval.

## Exact integration gate

```sh
pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages
```

The complete chain exited **0**, without a failed gate or gate rerun. Timestamped shell tracing records each command start; the enclosing pipeline captured the chain's exit status rather than only `tee`'s status.

| Command | Start (CEST, UTC+02:00) | Exit | Observed result |
| --- | --- | --- | --- |
| `pnpm wireframes:generate` | Oct 17 23:54:55 | 0 | 3 canonical screens generated. |
| `pnpm wireframes:render` | Oct 17 23:54:55 | 0 | CAP-001 1440×4900, CAP-002 1440×3600, CAP-003 1440×2400; headings visible, no horizontal/vertical overflow or page errors. |
| `pnpm records:check` | Oct 17 23:54:58 | 0 | 3 capabilities, 10 change records, wireframe manifest synchronized. |
| `pnpm test` | Oct 17 23:54:58 | 0 | Core: 65 files, 1,133 passed / 1 skipped. API: 13 files, 270 passed. Web: 81 files, 1,216 passed. Cloudflare: 1 file, 11 passed. Record-validator regressions: 72 passed, 0 failed/skipped. |
| `pnpm lint` | Oct 17 23:55:18 | 0 | All four workspace lint tasks passed; Svelte reported 0 errors and 0 warnings. |
| `pnpm build` | Oct 17 23:55:28 | 0 | Core TypeScript, web Vite and API TypeScript builds passed. Non-failing chunk-size warning described below. |
| `pnpm test:e2e` | Oct 17 23:55:36 | 0 | 69 passed, including the deterministic filesystem picker/editor/recovery workflows; no skipped tests. |
| `pnpm test:e2e:prod` | Oct 17 23:57:58 | 0 | 5 passed: Demo/CSP, immutable asset caching, API-route separation, SPA deep link and frame-ancestor policy. |
| `pnpm test:e2e:pages` | Oct 17 23:58:07 | 0 | 2 passed / 2 intentionally skipped: local static source/assets and Clipboard behavior passed; GitHub OAuth cases are disabled for static Pages. Finished Oct 18 00:00:31. |

### Skips and diagnostics

- The core skip is the optional local snapshot comparison in `packages/keymap-core/src/host-legend.golden.test.ts:134–140`, which skips when its untracked `src/__golden__/host-legend.json` is absent. Its coverage test passed. No golden was created and no broader snapshot claim is made.
- The Pages skips are `e2e/pages/pages-smoke.spec.ts:46` and `:64`. Both explicitly skip when `PAGES_EXPECT_GITHUB` is not `true`, with the reason “GitHub is deliberately disabled on static Pages.” These are not filesystem acceptance tests; this run does not certify live OAuth or a deployed site.
- Existing non-character xkb diagnostics and deliberately injected API/storage-failure stderr appeared in passing test suites. No failed tests were reported.
- Vite warned about chunks larger than 500 kB in build and hosting-smoke builds. The main build reported `index-BwbcYsti.js` at 1,766.91 kB (424.10 kB gzip). No bundle-size remediation was attempted in this documentation-only scope.

## Canonical surface and link verification

Both impacted CAPs correctly declare `**Primary surface:** human`: CAP-002 owns source/persistence interaction; CAP-003 owns host profiles, composed legends, host editing and deliverables. Both remain `partial`, preserving their documented limits. No new capability or surface claim was added.

A read-only audit verified, for each CAP:

- Exactly one matching manifest screen with the declared title and viewport.
- Both canonical artifact paths exist and are linked under the CAP's exact `## Links` heading.
- The wireframe index links both HTML and PNG; each screen's “All capabilities” link returns to the index.
- Referenced implementation/test paths exist (48 distinct backticked paths in CAP-002 and 30 in CAP-003); the root record validator also passed its record/link checks. Path existence is not substituted for the executed behavior suites.
- Every generated canonical HTML/PNG, manifest and index, including unaffected CAP-001, remains byte-identical to HEAD. CAP-001 was generated/rendered by the full gate but is not claimed as part of this phase's visual inspection.

| CAP | Canonical HTML | Canonical PNG | Viewport |
| --- | --- | --- | --- |
| CAP-002 | [Sources HTML](../../../product/wireframes/html/CAP-002-keymap-sources-and-persistence.html) | [Sources PNG](../../../product/wireframes/exports/CAP-002-keymap-sources-and-persistence.png) | 1440×3600 |
| CAP-003 | [Host HTML](../../../product/wireframes/html/CAP-003-host-layouts-and-legends.html) | [Host PNG](../../../product/wireframes/exports/CAP-003-host-layouts-and-legends.png) | 1440×2400 |

### Visual inspection

Read both generated HTML documents and their browser-rendered text/layout. Inspected both full PNGs, then overlapping native-resolution crops covering their entire height: CAP-002 `[0,0,1440,1250]`, `[0,1200,1440,2450]`, `[0,2400,1440,3600]`; CAP-003 `[0,0,1440,1250]`, `[0,1150,1440,2400]`. Crop boundaries were distinguished from actual page clipping.

- **CAP-002:** All five sources are distinct. Staged firmware/open-without-layout and read-only folder choice remain separate. The red **Grant write access** control is readable and visually distinct from Save. Loaded/draft/saved/pending chrome, uncertain completion and no-write reconciliation are explicit. Reconnect after unreadable input, destructive attempt-retirement/baseline-replacement consent, pre-Restore transfer protection and opt-in remember/forget are legible. The GitHub inventory, omitted-host reset, leave/restore examples, source boundaries and footer remain separated without observed overlap or clipping.
- **CAP-003:** The composed-board glyphs/placeholders, expanded firmware layer controls and Alt+click host-edit example are readable. Immediate glyph edits versus Accept/Cancel are explicit. The filesystem card visibly states host-local work, disabled firmware Save for host-only edits, no host-file writes and separate verified/pending outcomes. GitHub compatible/omitted states, identity-only host discard and Linux/Windows downloads remain distinct; downloads do not claim OS installation. No observed overlap or clipping; the footer/link is complete.
- Supplementary Playwright assertions passed for both pages: correct headings and viewport-sized documents, no page errors, no overflowing card/chip/field/notice content, and footer bottoms within the canvas (CAP-002 `3465.140625`, CAP-003 `2259.34375`). A fresh in-memory screenshot from each HTML was byte-identical to its canonical PNG.
- The first supplementary DOM command completed its assertions but failed log capture because an exported scratch-path variable did not persist between terminal tool calls (`tee: /visual-dom-audit.log: Permission denied`). Repeating the read-only audit with an absolute scratch log path exited 0. This was not a failure or rerun of the required integration gate, and no file was written at `/visual-dom-audit.log`.

### Artifact fingerprints (SHA-256)

| Artifact | SHA-256 |
| --- | --- |
| CAP-002 HTML | `27b3ca54626d33e3681f4869a82991a9da12e635667684168ec41d02b7882c64` |
| CAP-002 PNG | `4b7909cfcfa6ca7f10b14f86989d13058e50b7e6dc91d822bf19440b40a75c03` |
| CAP-003 HTML | `2c778d108e23298935a0dcf218079aac8cc53d019cd3c5fc8f7229e27c3688e5` |
| CAP-003 PNG | `9bf8c62e7994976d83a4153d600dd3f6ccecbed0d2b1765c4064702d960d5fb5` |

## Supporting execution artifacts

Scratch directory: `/home/raphael/.hermes/profiles/hermes-dev-exec/cache/scratch/chg007-phase4.sX4bt1/`.

- `phase-4-gate.log`: complete timestamped command output; SHA-256 `debc188387b3ca96d9c375a179d392dfad774253743be213e56dc218a9159b47`.
- `gate-status.txt`: chain exit 0 and completion timestamp; SHA-256 `1c25e4793626ae4c846e2f551c5098d4015d75a13e72f76ca9c929126c3e0d8b`.
- `visual-dom-audit.log`: successful supplementary browser version, heading/layout/footer checks and artifact hashes.

Scratch logs are local, ephemeral evidence; this receipt retains the results and canonical artifact identities. The final two-file review fingerprint belongs in the handoff outside this receipt to avoid self-reference; prior-phase approval is not approval of that fingerprint.

## Remaining limitations and review handoff

- The entire CHG remains bounded to one existing raw `.keymap` output per Save. Directory access is read-only discovery. All sidecar, geometry, host, template, marker and multi-file writes remain deferred; the future multi-file protocol and ADR repository-root expansion were not implemented by this phase.
- Synthetic handles/permission doubles and browser storage prove the tested application paths, not arbitrary native browser activation, external-editor locking, filesystem compare-and-swap or crash durability. Browser storage/handle loss, third-value conflicts and changed dependencies still fail closed or require explicit recovery; use one writer.
- The earlier manual supported-Edge check is evidence only from the linked Phase 3 receipt, including its stated operator-controlled real-file boundary. It was not repeated or independently re-certified in Phase 4. No real user file access was needed here.
- No integration-gate failure or unresolved closure-criterion ambiguity was found within this bounded verification. Skips and build diagnostics above remain explicit limits, not claims of full ZMK/browser/OS or deployed OAuth compatibility.
- DOX pass: root/docs/changes ownership, workflows and child indexes are unchanged. Applicable AGENTS.md files, CAPs, product docs, the change index and prior review receipts are intentionally unchanged. The active CHG directly links this receipt within its existing linked review-only package; package README edits are outside the operator-authorized scope.

## Closeout

- Fresh independent Grok review `review-close-chg007-phase4` verified frozen patch `9ff89378b796eaa0f926c37b947cef819775cac572bec51771c3815519520442` and returned **No findings**. Its receipt is [Phase 4 autonomous review](phase-4-autonomous-review.md).
- This record's owner is now archived, its package README indexes both Phase 4 receipts, and `docs/changes/README.md` moves CHG-007 from current records to the archive. The close transition does not start another phase or alter the one-existing-raw-`.keymap` boundary.
