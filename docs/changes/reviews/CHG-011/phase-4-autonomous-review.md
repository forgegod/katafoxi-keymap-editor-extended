# CHG-011 Phase 4 autonomous review

**Status:** review-only
**Reviewer:** Grok, fresh `review-chg011-phase4` session, read-only
**Scope:** The frozen phase-4 diff for CHG-011: `packages/keymap-core/AGENTS.md`, one paragraph, in the reserved worktree `/home/raphael/src/katafoxi-keymap-editor-worktrees/chg011-phase4` at base `5e12cb885b67c7324870035bd2186390bb19329a`. The reviewed implementation is commit `8f415f3895756bb3e06ce3660656af60ac76e6e5`.
**Reviewed:** 2026-10-21, on the frozen diff before it was committed.

## The diff under review

One file, one paragraph. The paragraph documents CHG-011's implemented core contracts, and the diff removes its final sentence "Phase 3 browser wiring and CAP promotion remain separate work." Phase 3 is integrated at `e04c895`, the GitHub dialog shows the API-supplied path, and CAP-001/CAP-002 already state the promoted behaviour, so that sentence was false. Nothing else in the paragraph changed.

## Evidence reviewed

- The reviewer read the diff directly and confirmed the remaining paragraph still matches the code: `packages/keymap-core/src/layout.ts:265-266` returns `null` for a named file with no own `layouts` member; `layout.ts:267-274` with `packages/keymap-core/src/errors.ts:16-25` throws `InfoValidationError` carrying the caller-supplied path and never treats a present invalid value as absence; `packages/keymap-core/src/keymap.ts:850-878` checks exact leading `&hm`/`&as` against non-override `holdTaps` before catalog validation, including `combos[].binding` and `sensorBindings`, and does not accept a same-label macro or behavior definition. Local still requires layout metadata; GitHub still infers the binding-count rectangle.
- The reviewer independently confirmed the acceptance criteria against the adapter and browser suites, including `apps/api/src/services/github/selected-files.test.ts` for the ignored, invalid, and broken-shared named cases, and `apps/web/src/lib/components/Pickers/Github/Picker.test.ts` "attributes API $name ($path) to $file" for both `config/specimen.json` and `config/info.json`. No criterion lacked coverage.
- The reviewer independently ran `pnpm records:check && pnpm test && pnpm lint && pnpm build` in the worktree and saw exit 0, with `git status` still showing only the `AGENTS.md` edit afterwards.
- The reviewer checked the `Primary surface` declarations for CAP-001, CAP-002, and CAP-003 against `docs/product/wireframes/manifest.json` and each CAP's `## Links` section, confirmed the three PNG SHA-256 values match the committed exports, and inspected the rendered screens.
- The reviewer confirmed that no now-false CHG-011 claim remains in the DOX chain or the CAPs, and that stale statements about other change records were correctly left alone.

## Scope judgements

- The missing `packages/keymap-core/dist` in a fresh worktree is an environment prerequisite, not a CHG-011 defect: the package exports `./dist/index.js`, `dist` is gitignored, and CI builds before testing. It is outside this diff.
- The closeout itself is orchestrator work, not a defect of this diff. Archiving before the phase table is complete would be premature, and the present-tense boundary narrative had to be reconciled when the record was archived.

## Verdict

No findings.

The phase-4 implementation is approved for the close transition. The close transition must only: mark phase 4 done against `8f415f3895756bb3e06ce3660656af60ac76e6e5`, archive the record, move its change-index entry, repair the parity-evidence link to the archived path, and rerun `pnpm records:check`. It must not reopen an earlier phase, start another phase, or push.
