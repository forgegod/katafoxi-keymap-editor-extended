# CHG-011 — Upstream named-layout validation and hold-tap dependency

**Status:** in-progress
**External request:** Direct operator request: Evaluate the upstream and fork changes made since the last upstream assessment, then incorporate the ones that do not conflict with this project's current direction; local CHG decisions overrule conflicting upstream direction.
**Impacts:** CAP-001, CAP-002
**Baseline:** `8fb50d6f9689a3b738f1400b737778e4dfe780dc` on main
**Priority:** P3 — source-loading parity and error attribution; not a new capability

## Current boundary

`config/info.json` is the shared geometry file. A named `config/<keymap>.json` beside a scoped keymap is accepted as that keymap's physical layout, and a missing layout file leaves the board as a flat rectangle inferred from the binding count.

Two upstream changes are not yet reflected here:

1. A named layout file is accepted on its filename alone. The GitHub and Local adapters return the parsed JSON, and `validateInfoJson` later rejects it with `info must define "layouts"`, failing the whole load for a file that simply is not a layout file. The browser then blames a hardcoded `config/info.json`, so a broken `config/<name>.json` is reported against the wrong file.
2. The Homerow/Autoshift dependency rule for `keymap.json` is not stated. A binding of `&hm` or `&as` without a matching `holdTaps` node is already rejected, but incidentally: those codes are absent from the stock catalog, so the rejection comes from catalog membership rather than from a dependency check.

[Parity evidence](../upstream-gap-assessment.md) records the compared revisions and the per-commit evaluation. These are requested outcomes, not present capability claims.

## Dependencies

None. [CAP-001](../../product/capabilities/CAP-001-firmware-keymap-editing.md) and [CAP-002](../../product/capabilities/CAP-002-keymap-sources-and-persistence.md) already describe the source-loading boundaries this change narrows.

## Acceptance criteria

- A named `config/<keymap>.json` without a `layouts` object is ignored. The load continues, and the board keeps the existing flat-rectangle inference when no other layout file applies.
- A named layout file whose `layouts` object is present but invalid fails the load, and the reported error names that file.
- A broken `config/info.json` still fails the load and still names `config/info.json`.
- The error the browser shows names the file that actually failed, in the shared and the named case alike.
- A `keymap.json` binding `&hm` or `&as` without declaring that node in `holdTaps` is not a primary source, and the rule is stated explicitly instead of following from catalog membership.
- Unknown, lookalike, and malformed behavior labels stay rejected. The stock-catalog boundary from CHG-009 does not move.

## Owned implementation and evidence seams

- `packages/keymap-core/src/layout.ts`
- `packages/keymap-core/src/errors.ts`
- `packages/keymap-core/src/keymap.ts`
- `apps/api/src/services/github/files.ts`
- `apps/api/src/services/zmk/local-source.ts`
- `apps/web/src/lib/components/Pickers/Github/ValidationErrors.svelte`
- `apps/web/src/lib/components/Pickers/Github/Picker.svelte`

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the named-layout and hold-tap dependency contract | done (pnpm --filter @keymap-editor/keymap-core test -- src/upstream-source-boundary.test.ts src/keymap.test.ts src/dts-behaviors.test.ts src/dts-combos.test.ts src/dts-sensors.test.ts src/behavior-definitions.test.ts; pnpm --filter @keymap-editor/keymap-core lint; pnpm records:check exit 0 @ f377f1d8085ea27fa026cb42f551bab7f1a5296a) | CAP and focused test change reviewed |
| 2 | Implement the core and adapter contract | pending | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/api test` exit 0 |
| 3 | Integrate the browser error surface, records, and visuals | pending | `pnpm --filter @keymap-editor/web test && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exit 0 |
| 4 | Verify and close the change | pending | `pnpm records:check && pnpm test && pnpm lint && pnpm build` exit 0 |

## Phase 1 — Specify the named-layout and hold-tap dependency contract

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Define in `packages/keymap-core/src/layout.ts` the rule that a named layout file is a physical layout only when it carries a `layouts` object, and that a present `layouts` value must pass validation. Decide the helper's name and shape for the adapters to call, and confirm the shared `config/info.json` path keeps its current stricter behavior.
2. Decide how a failed file is attributed. `InfoValidationError` currently carries only a message list; specify the added path field, its type, and the API and browser surfaces that consume it.
3. Write the proposed regression cases before implementation: a named file without `layouts`, a named file with a broken `layouts` object, a broken shared `config/info.json`, a `keymap.json` binding `&hm` without a `holdTaps` node, and the same file with the node declared. Fix each expected outcome against the acceptance criteria above.
4. Confirm the CHG-009 boundary explicitly: unknown, lookalike, and malformed labels stay rejected, and no phase may widen catalog membership.

**Verification gate:** CAP and focused test change reviewed.

## Phase 2 — Implement the core and adapter contract

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Implement the named-layout acceptance rule and the file-attribution field in core, leaving the shared `config/info.json` path unchanged.
2. Use the rule in the GitHub and Local adapters, so an ignored named file leaves the load usable and a broken named file is reported under its own path.
3. State the Homerow/Autoshift dependency rule explicitly in the primary-source check, without changing today's outcome for any existing input.
4. Add the focused core and adapter regression cases from phase 1, and prove the unknown-label boundary still holds.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/api test` exit 0.

## Phase 3 — Integrate the browser error surface, records, and visuals

**Goal:** Make the changed behavior visible and its canonical surface current.

1. Show the failing file in the GitHub picker's validation error instead of a hardcoded `config/info.json`.
2. Update CAP-001 and CAP-002 for the changed source-loading and error-attribution outcomes, and the [file contract](../../adr/0002-keymap-file-contract.md) for the load-priority rule.
3. Add the file-scoped validation error to the CAP-002 schematic, regenerate the canonical HTML and PNG, and inspect the result. That error state is not currently depicted.
4. Extend the affected browser and adapter behavior tests.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exit 0.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration gate passes.

1. Run the full gate below on the actual revision. Record exact commands, results, supported environment, and remaining limitations.
2. Inspect every changed canonical HTML and PNG, and confirm the `Primary surface` declarations remain honest.
3. Only then mark all phases done with evidence, mark the CHG done, move it to `archive/`, and update the change index. Do not commit, push, or deploy without separate authorization.

**Verification gate:** `pnpm records:check && pnpm test && pnpm lint && pnpm build` exit 0.

## Upstream evaluation

Only the two accepted changes above become work. The rest of the upstream delta is declined or does not apply to this project.

```text
commit    upstream change                                           decision
2b9b51b   GitHub App install returns keep OAuth state               already in main as bd9aa1e
ad1998d   load matching config layouts for named keymaps            already in main as 2bb062d
bd446c6   recognize &sys_reset and &studio_unlock                  already in main as 0650405
e58928b   accept named layout JSON only with a layouts object       accepted, phases 1 to 3
3646de4   cover a named-layout keymap with reset, Unicode, encoders  accepted as phase 1 to 3 regression coverage
f74a94d   require a declared node for &hm and &as in keymap.json     accepted, phases 1 to 4
aa83775   accept well-formed unknown behaviors everywhere            declined for the relaxed catalog check
a2ef691   let the language list overflow visibly                    declined
abec2b9   meta tags, robots.txt, sitemap.xml                        not applicable
aef03c0   Open Graph and Twitter meta tags                          not applicable
0ed3f70   Cross-Origin-Resource-Policy for og.jpg                   not applicable
4f733c6   Caddyfile www redirect and deploy notes                   not applicable
ebbe710   og.jpg image update                                      not applicable
01232db   og.jpg image update                                      not applicable
be21bd9   optional local Chromium executable path                   not applicable
```

The declined changes, with reasons:

- `aa83775` also relaxes stock-catalog membership, so a well-formed unknown label becomes valid. CHG-009 fixed that boundary deliberately, and `packages/keymap-core/AGENTS.md` keeps it: other unknown labels require the existing explicit source-import option or a declared-model allowance. The local decision stands. Only the argument-retention half of that change is missing here, and it is already present in `packages/keymap-core/src/keycodes.ts`.
- `a2ef691` removes the bounded height and scrolling from the host language list. The fork's own `9fd46e2` added that behavior together with the language menu's keyboard accessibility, so adopting the upstream style would undo local work.

The remaining commits belong to the upstream project's own domain, deployment, and browser tooling. This fork serves a different site and installs its own Chromium in CI.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` as the only editable screen-definition source, render with `pnpm wireframes:render`, and inspect the result. The CAP-002 schematic gains a file-scoped validation error state in phase 3. No proposal package is required to plan this change; if one is added before implementation, it belongs in `docs/changes/reviews/CHG-011/` with a review-only README linked from this record.

## Out of scope

- Relaxing stock-catalog membership, or accepting unknown, lookalike, or malformed behavior labels.
- Changing the shared `config/info.json` precedence, the flat-rectangle inference, or the named-layout filename rule.
- Writing, creating, or migrating any layout file, and any change to the GitHub write set.
- The upstream project's own SEO assets, domain, deployment, and browser tooling.
