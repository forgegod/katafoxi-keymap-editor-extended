# CHG-009 — Correct stock ZMK behavior catalog

**Status:** done
**External request:** Direct operator request: Continue as proposed creating a new CHG
**Impacts:** CAP-001
**Baseline:** `8081db012b53792a77ea555101957870fff2ecf3` on main; recheck branch, working-tree ownership, and the ZMK source revision before execution.
**Priority:** P1 — catalog correctness before further picker work

## Current boundary

CHG-001 added `BT_DISC`, `BT_CLR_ALL`, `RGB_ON`, and `RGB_OFF`. A subsequent comparison with local ZMK main at `5b51501f` found the following baseline defects outside that closed scope, corrected in phase 2:

- `&out` omitted `OUT_NONE`, and its `OUT_USB` / `OUT_BLE` descriptions were reversed from ZMK.
- Stock bindings `&kt`, `&gresc`, and `&soft_off` were absent from the picker.
- `&reset` was advertised as a stock binding even though this ZMK revision defines `&sys_reset` and `&bootloader` instead.

The catalog remains a picker aid, not a claim that every arbitrary source behavior is schema-editable. Existing unknown bindings and parameters must remain source-preserving.

Local ZMK source evidence is `../zmkfirmware-zmk/docs/docs/keymaps/behaviors/index.mdx`, `../zmkfirmware-zmk/docs/docs/keymaps/behaviors/outputs.md`, and the matching DTS/header files. Phases 1–3 passed their gates and operator-reported independent reviews. Phase 4 passed its exact full gate after the operator-approved model-test correction: stored layer preferences may include unavailable layers; effective rendered layers must be in range. Runtime behavior remains unchanged. This archived implementation receipt retains the first failed gate and corrected diagnosis; fresh Grok review of the final phase-4 diff returned No findings.

## Dependencies

None. Coordinate with CHG-006 only if this limited stock catalog work would grow into editable custom behavior definitions.

## Acceptance criteria

- The `&out` picker accurately describes `OUT_USB` and `OUT_BLE` and offers `OUT_NONE`; applying each writes its exact source token without executing firmware actions in the browser.
- The picker offers ZMK stock `&kt` with one keycode parameter, plus parameterless `&gresc` and `&soft_off`. `&soft_off` clearly states the required `CONFIG_ZMK_PM_SOFT_OFF=y` firmware setting.
- The stock picker no longer advertises invalid `&reset`; `&sys_reset` and `&bootloader` remain available. Matching behavior-documentation links exist for every newly catalogued stock binding.
- Selecting every new choice, Apply, reopen, and export retain the exact binding. Imported unknown/custom bindings and opaque arguments remain unchanged on a no-op Apply.
- The work does not add an arbitrary custom-behavior editor, change a keyboard `.conf`, execute firmware actions, or make `&inc_dec_cp` a new picker choice. The deprecated source alias remains source-preserved.

## Owned implementation and evidence seams

- `packages/keymap-core/data/zmk-behaviors.json`
- `packages/keymap-core/src/behaviors.ts`
- `packages/keymap-core/src/zmk-docs.ts`
- `packages/keymap-core/src/behaviors.test.ts`
- `packages/keymap-core/src/keymap.ts`
- `packages/keymap-core/src/keymap.test.ts`
- `apps/web/src/lib/hydrate.ts`
- `apps/web/src/lib/hydrate.test.ts`
- `apps/web/src/lib/key-edit-session.svelte.ts`
- `apps/web/src/lib/key-edit-session.test.ts`
- `apps/web/src/lib/components/KeyEditor/KeyEditor.test.ts`
- `apps/web/src/lib/components/Keyboard/Keys/Key.test.ts`

Paths name existing seams, not a claim that every listed file must change. Re-read applicable DOX and current source before execution. Add focused regressions before implementation.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify catalog correctness and evidence | done (`pnpm records:check` exit 0; fresh independent Grok review: No findings; ZMK pin and expected RED confirmed: core 12 failed/20 passed, web 7 failed/55 passed) | `pnpm records:check` passes; ZMK source matrix and focused regressions reviewed |
| 2 | Implement and prove the catalog slice | done (full phase gate exit 0: core 776 passed/1 existing optional golden skip, web 621 passed; operator-reported fresh Grok final review: No findings, including corrected legacy reset JSON import) | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the picker and current-state visual | done (full phase gate exit 0: 638 web tests, 38 Chromium e2e tests, generated/rendered visuals and records valid; operator-reported fresh Grok review: No findings, confirming browser/e2e, CAP, generated wireframe and visual evidence) | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | done (corrected exact full gate exit 0: core 776 passed/1 existing skip, API 226, web 642, Cloudflare 11, records 72; e2e 38, prod 5, Pages 2 passed/2 existing skips; CAP links and regenerated visual inspected; fresh Grok review: No findings) | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify catalog correctness and evidence

**Goal:** Pin the supported stock binding and command matrix without claiming implementation.

1. Recheck `../zmkfirmware-zmk` revision, DTS labels, binding-cell arity, public headers, and ZMK behavior documentation. Record the exact source evidence for `&kt`, `&gresc`, `&soft_off`, `OUT_NONE`, and reset labels.
2. Specify descriptions, inclusion requirements, documentation links, `&soft_off` firmware prerequisite copy, and no-op source-preservation cases. Add regressions that fail before the catalog change.
3. Confirm that `RGB_COLOR_HSB(h,s,b)` remains excluded: it needs a parameterized color-control interaction, not a static command row.

**Verification gate:** `pnpm records:check` passes; ZMK source matrix and focused regressions reviewed.

### Pinned ZMK evidence

Phase-1 specification evidence, recorded before catalog implementation, from clean local
`../zmkfirmware-zmk` at `5b51501fead672c41b5cfb396f3dafe0894bf4e9`
(`fix(split): Use our managed queue for input report to avoid deadlock (#3110)`).
All paths/line ranges below are relative to that checkout and revision, not moving
main. [Pinned upstream tree](https://github.com/zmkfirmware/zmk/tree/5b51501fead672c41b5cfb396f3dafe0894bf4e9).
The sibling checkout is evidence only: tests must not require it, network access,
a firmware build, or hardware. Public docs URLs below are picker destinations;
the local Markdown at the pinned revision establishes their intended content.

| Binding / source token | DTS label, node, compatible, and binding cells | Public-header evidence / additional keymap include | Pinned behavior docs | Target picker docs URL |
| --- | --- | --- | --- | --- |
| `&out OUT_USB` | `app/dts/behaviors/outputs.dtsi:14–17`: `out: outputs`, `zmk,behavior-outputs`, 1 | `app/include/dt-bindings/zmk/outputs.h:8`: `OUT_USB 1`; `#include <dt-bindings/zmk/outputs.h>` | `docs/docs/keymaps/behaviors/outputs.md:21–46,55–59` | `https://zmk.dev/docs/keymaps/behaviors/outputs` |
| `&out OUT_BLE` | Same `out` node, 1 | `outputs.h:9`: `OUT_BLE 2`; same include | `outputs.md:21–46,61–65` | `https://zmk.dev/docs/keymaps/behaviors/outputs` |
| `&out OUT_NONE` | Same `out` node, 1 | `outputs.h:10`: `OUT_NONE 3`; same include | `outputs.md:21–46` | `https://zmk.dev/docs/keymaps/behaviors/outputs` |
| `&kt KEYCODE` | `app/dts/behaviors/key_toggle.dtsi:14–17`: `kt: key_toggle`, `zmk,behavior-key-toggle`, 1 | `#include <dt-bindings/zmk/keys.h>`; `app/include/dt-bindings/zmk/keys.h:25,782` defines `A` and `LALT` used by examples | `docs/docs/keymaps/behaviors/key-toggle.md:8–26` | `https://zmk.dev/docs/keymaps/behaviors/key-toggle` |
| `&gresc` | `app/dts/behaviors/gresc.dtsi:16–21`: `gresc: grave_escape`, `zmk,behavior-mod-morph`, 0; `ESC` / `GRAVE`, left/right Shift or GUI | No additional invocation header; DTS already includes `keys.h` at line 9. `keys.h:207,293` defines `ESC` / `GRAVE` | `docs/docs/keymaps/behaviors/mod-morph.md:17–43` | `https://zmk.dev/docs/keymaps/behaviors/mod-morph#behavior-binding` |
| `&soft_off` | `app/dts/behaviors/soft_off.dtsi:14–17`: `soft_off: z_so_off`, `zmk,behavior-soft-off`, 0; `split-peripheral-off-on-press` | No additional invocation header; firmware prerequisite below | `docs/docs/keymaps/behaviors/soft-off.md:8–21,26–48` | `https://zmk.dev/docs/keymaps/behaviors/soft-off` |
| `&sys_reset` | `app/dts/behaviors/reset.dtsi:12–15`: `sys_reset: sysreset`, `zmk,behavior-reset`, 0 | No additional invocation header; reset DTS includes `dt-bindings/zmk/reset.h` at line 7 | `docs/docs/keymaps/behaviors/reset.md:13–26,45–49` | `https://zmk.dev/docs/keymaps/behaviors/reset` |
| `&bootloader` | `app/dts/behaviors/reset.dtsi:19–24`: `bootloader: bootload`, `zmk,behavior-reset`, 0; `type = <RST_UF2>` and `bootloader` flag | No additional invocation header; `app/include/dt-bindings/zmk/reset.h:13` defines `RST_UF2 0x57` internally, not a binding argument | `docs/docs/keymaps/behaviors/reset.md:29–49` | `https://zmk.dev/docs/keymaps/behaviors/reset` |

- `app/dts/behaviors.dtsi:7–28` includes all these stock nodes. Keymaps need
  `<behaviors.dtsi>` or equivalent existing explicit behavior includes; do not
  duplicate their definitions. `docs/docs/keymaps/behaviors/index.mdx:18–20,49–61,70–75`
  independently lists the public binding labels.
- Matching schemas in `app/dts/bindings/behaviors/` confirm arity:
  `zmk,behavior-outputs.yaml:8` and `zmk,behavior-key-toggle.yaml:8` include
  `one_param.yaml`; `zmk,behavior-mod-morph.yaml:8`,
  `zmk,behavior-soft-off.yaml:8`, and `zmk,behavior-reset.yaml:8` include
  `zero_param.yaml`. Configuration properties are not invocation parameters.
- `app/src/behaviors/behavior_outputs.c:64–74` maps USB, BLE, and NONE to their
  corresponding transports. `OUT_TOG 0` at `outputs.h:7` remains available.
  The catalog must retain symbolic tokens, not emit these numeric expansions.
- No stock `reset:` label exists in `app/dts/behaviors` at the pinned revision
  (tracked-source search returned no match). This is not evidence that a user's
  external `&reset` definition is invalid: stop advertising it, remove its stock
  docs mapping/role entry, but never rewrite imported `&reset` to `&sys_reset`.

### Target copy, prerequisites, and preservation contract

| Choice | Target English catalog copy | Editor parameter contract |
| --- | --- | --- |
| `OUT_USB` | `Prefer sending to USB.` | One command token, no additional parameter |
| `OUT_BLE` | `Prefer sending to the current Bluetooth profile.` | One command token, no additional parameter |
| `OUT_NONE` | `Prevent sending any output.` | One command token, no additional parameter |
| `&kt` — `Key Toggle` | `Toggle the key press; hold it until toggled again or released elsewhere.` | `params: ['code']`; normal keycode picker, including modifier-key/wrapper support already used by `&kp` |
| `&gresc` — `Grave Escape` | `Send Escape, or Grave when Shift or GUI is held.` | `params: []`; no value slot |
| `&soft_off` — `Soft Off` | `Turn the keyboard off.` | `params: []`; no value slot; firmware note required |
| `&sys_reset` — `Reset` | Retain existing name; documentation means restart the currently flashed firmware | `params: []`; no value slot |
| `&bootloader` — `Bootloader` | Retain existing name; documentation means reset into bootloader for flashing | `params: []`; no value slot |

Exact `behaviorFirmwareNote('&soft_off')` target:

> Firmware: CONFIG_ZMK_PM_SOFT_OFF=y in the keyboard .conf; requires hardware power-off support. Wake-up depends on the keyboard hardware (dedicated wake button or reset). This editor only stages the binding; it does not change firmware configuration or turn off hardware.

- Prerequisite evidence: `docs/docs/config/power.md:17–22` documents soft-off as
  disabled by default; `app/Kconfig:432–438` requires `HAS_POWEROFF`;
  `app/Kconfig.behaviors:88–91` gates the behavior on `ZMK_PM_SOFT_OFF`.
  Wake-up is hardware-dependent (`soft-off.md:8`), not an ordinary-key guarantee.
  Stock release/hold-time/split details remain linked documentation, not new
  configuration controls. Reset behaviors affect the invoking half of a split
  keyboard (`reset.md:45–49`), not necessarily the entire keyboard.
- Output choices express firmware preferences, not browser actions or transport
  availability detection. USB/BLE depend on the firmware build and connections
  (`behavior_outputs.c:31–44`, `outputs.md:8–18`). `OUT_NONE` suppresses output;
  it does not power off, unpair, or clear bonds. No `.conf` edit, flashing, or
  firmware action is performed by selecting or applying any catalog choice.
- Includes have a bounded contract: catalog metadata supplies `outputs.h` for
  `&out` and `keys.h` for `&kt` to generated templates. In current
  `packages/keymap-core/src/keymap.ts:397–419,505–520`, ordinary source splicing
  preserves the original preamble instead of injecting catalog headers. Existing
  source must already provide the needed includes. Do not promise automatic
  include insertion, rewrite the preamble, or expand this phase into include repair.
- Selecting a new behavior intentionally replaces the old binding and its
  parameters. No-op Apply instead retains the imported binding tree and opaque
  arguments, including function-like tokens, unknown commands, deprecated
  aliases, and external/custom labels. No arity inference, dropping arguments,
  alias renaming, numeric macro expansion, or firmware validation is allowed on
  that no-op path. This is token/tree preservation within ADR 0002's existing
  parser/splice boundaries, not a promise of byte-identical whitespace or lossless
  C preprocessor alias expansion.
- Focused no-op cases include all matrix bindings, `&kt LA(A)`,
  `&kt VENDOR_KEY(1,2)`, `&reset`, `&reset WRAP(1,2) 3`,
  `&custom WRAP(1,2) 3`, `&out VENDOR_OUT 7`,
  `&inc_dec_cp C_VOL_UP C_VOL_DN`, and `&rgb_ug RGB_COLOR_HSB(10,20,30)`.
  Vendor examples are deliberately opaque import fixtures, not valid stock
  firmware invocations. Phase 3 must prove selection, Apply, cancel, reopen, and
  export; the phase-1 session checks alone do not establish browser/export coverage.
- Preserve but do not promote `&inc_dec_cp`: the deprecation and shared label
  are explicit at `app/dts/behaviors/sensor_rotate_key_press.dtsi:9–13`.
  Keep `RGB_COLOR_HSB(h,s,b)` and `RGB_COLOR_HSB_CMD` out of static command rows.
  `app/include/dt-bindings/zmk/rgb.h:21,36–38` defines a parameterized color macro;
  a color-control interaction and its preservation proof remain a separate CHG.

### Pre-implementation regressions and discovered preservation gap

- `packages/keymap-core/src/behaviors.test.ts`, suite `CHG-009 stock catalog contract`:
  explicit output copy/arity/includes, new stock definitions, soft-off note,
  `&reset` exclusion, retained reset labels, docs links, and exclusion controls.
- `apps/web/src/lib/key-edit-session.test.ts`, suite `CHG-009 stock selection contract`:
  real catalog/search choices (no fake future entries), output selection/reopen,
  one keycode slot for `&kt`, parameterless replacement, `&reset` exclusion,
  and imported no-op preservation. Passing controls distinguish existing behavior
  from the intended RED cases.
- RED exposed existing truncation: `&reset WRAP(1,2) 3` becomes `&reset`, and
  `&out VENDOR_OUT 7` becomes `&out VENDOR_OUT` on no-op Apply. Source trace:
  `apps/web/src/lib/hydrate.ts:63–73,115–120` maps only the parameter schema returned
  by `packages/keymap-core/src/keycodes.ts:48–66`; session open hydrates the binding
  before cloning at `key-edit-session.svelte.ts:196–204`. Unknown behavior fallback
  already preserves raw arguments, but a known catalog schema can truncate them.
  This is required-now evidence for phase 2's existing opaque-preservation acceptance
  criterion, not authorization to fix it in phase 1 or to build a custom editor.
  The same boundary must be checked when promoting previously unknown stock labels.

## Phase 2 — Implement and prove the catalog slice

**Goal:** Correct only the stock catalog entries and prove generated bindings retain their intended shape.

1. Extend the shared catalog and behavior helpers for the documented stock bindings/commands, their keycode and parameterless arities, firmware note, and docs URLs. Drop stock promotion of `&reset`.
2. Add core and session regressions for command descriptions, `OUT_NONE`, stock binding availability, exact parse/encode round trips, and imported custom/opaque no-op behavior.
3. Keep source text preservation and unknown-binding fallbacks intact; do not add parser-specific handling for arbitrary behavior definitions.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the picker and current-state visual

**Goal:** Make the corrected choices usable in the existing KeyEditor and update CAP-001 only once behavior exists.

1. Exercise keyboard selection, Apply, cancel, reopen, and source export for each new choice. Confirm `&kt` opens the keycode picker and parameterless bindings apply directly.
2. Update CAP-001 and its canonical KeyEditor generator only for implemented catalog choices. Regenerate HTML and PNG, inspect the rendered screen, and retain the browser-only firmware boundary.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

### Required-now integration finding

The new browser no-op regression exposes a preview-only loss: imported
`&reset WRAP(1,2) 3` displays `&reset WRAP 3`. The session's `bindingLabel`
encodes the preserved tree, but KeyEditor prefers `editorBindingPreview` rebuilt
from editable slots, which omit opaque descendants and excess arguments.
Phase 3 owns correcting that display/Apply mismatch and its component/browser
regressions. Keep the preserved session tree authoritative; do not expand schemas,
change hydration, splice/preamble handling, or expose opaque arguments as custom
behavior controls. The initial focused browser run had 8 passes and 2 failures:
this preview mismatch and a test-only partial `Load` locator matching
`bootloader` in the paste control's accessible name (use exact `Load`).

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update CAP-001 implementation and test links, inspect the regenerated canonical wireframe, and confirm it states only implemented behavior.
2. Run the full integration gate on the actual revision. Record exact results and real blockers; retain any review package at its stable path.
3. Only then mark phase rows done with evidence, archive this record, and update the change index. Do not commit, push, deploy, or change credentials without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

CAP-001 already owns the human KeyEditor surface. Implementation updates its canonical `docs/product/wireframes/generate.mjs` definition, generated HTML, rendered PNG, CAP links, and behavior tests in the same slice. Before implementation, any proposal belongs only in `docs/changes/reviews/CHG-009/` with a review-only README linked from this record. No review package exists or is needed merely to plan this change.

## Out of scope

- A color picker for `&rgb_ug RGB_COLOR_HSB(h,s,b)`; create a separate CHG because it needs a parameterized interaction and source-preservation proof.
- General custom behavior, macro, mod-morph, tap-dance, or sensor-rotate definition authoring; CHG-006 owns that broader work.
- Firmware configuration, flashing, hardware control, or keyboard-specific behavior discovery.
- Promoting the deprecated `&inc_dec_cp` alias to a picker choice.

## Execution state

Phases 1–3 are done following their recorded gates and independent reviews.
The operator authorized phase 4 only from clean committed `main` at
`03457f1047d78cd14ead789e9d41da9a29e21640`. That exact HEAD, an empty working
tree/index, Node `24.21.0`, and pnpm `9.15.0` were verified before marking phase 4
in-progress. The first exact full gate failed; its evidence is retained below.
Follow-up inspection corrected the diagnosis to a model-test contract mismatch,
not a demonstrated runtime discard defect. Direct operator request:
"Confirm the recommended fix" authorizes the test-only correction and focused
short-keymap/discard/undo/redo regressions, with runtime behavior unchanged.
The correction resumed from frozen blocker diff
`3472701770f3bc01bd6fffd75aaaef0e19ce4f6df575fa5b1b2563640fa1efe1` on the same
HEAD. The fresh exact full gate passed, CAP-001 and its regenerated visual were
verified, and this change is done and archived under the original phase-4
authorization. Only closure metadata changed after that gate. Fresh independent
Grok review of the frozen complete patch returned No findings; its outcome is
recorded in the phase-4 receipt below.
Do not stage, commit, push, deploy, alter credentials, execute firmware actions,
add custom behavior/color controls or include repair, or start another CHG.
Historical phase receipts below describe their own checkpoints, not the current
authorization.

### Phase-1 executable evidence

| Check | Observed result |
| --- | --- |
| Before adding tests: `pnpm --filter @keymap-editor/keymap-core test -- src/behaviors.test.ts` | Exit 0; 15 passed |
| Before adding tests: `pnpm --filter @keymap-editor/web test -- src/lib/key-edit-session.test.ts` | Exit 0; 37 passed |
| After adding tests, catalog untouched: `pnpm --filter @keymap-editor/keymap-core test -- src/behaviors.test.ts` | Exit 1; 12 failed, 20 passed (32 total); reproduced on a second run |
| After adding tests, catalog untouched: `pnpm --filter @keymap-editor/web test -- src/lib/key-edit-session.test.ts` | Exit 1; 7 failed, 55 passed (62 total); reproduced on a second run |
| `pnpm --filter @keymap-editor/keymap-core lint && pnpm --filter @keymap-editor/web lint` | Exit 0; Svelte check reports 0 errors and 0 warnings |
| `pnpm records:check` | Exit 0; 3 capabilities, 10 change records, wireframe manifest in sync |

Core RED reasons: reversed USB/BLE descriptions; missing `OUT_NONE`, `&kt`,
`&gresc`, `&soft_off`; missing soft-off prerequisite note; non-stock `&reset`
promotion; missing docs mappings for `&kt`, `&gresc`, `&soft_off`, and `&sys_reset`.
Web RED reasons: missing `OUT_NONE`/three stock behavior choices, advertised
`&reset`, and the two documented no-op truncations. These are assertion failures,
not setup/import errors. Existing tests still pass; passing new controls are not
claimed as newly implemented behavior. No tests are skipped or marked expected-fail.
Full integration/browser gates are intentionally not run in this RED-only slice.

DOX pass: root, core, web, docs, product, and changes contracts remain applicable
and unchanged; no ownership, hierarchy, runtime contract, or durable workflow was
changed. The proposed contract and executable evidence stay owned by this CHG.
CAP-001 and canonical visuals remain unchanged because no product behavior shipped.

**Review outcome and handoff:** the operator reports that fresh independent Grok
review of the frozen specification/test diff returned **No findings**, confirming
ZMK pin `5b51501fead672c41b5cfb396f3dafe0894bf4e9` and the expected RED counts
(core: 12 failed, 20 passed; web: 7 failed, 55 passed). The reviewed fingerprint
(`git diff --binary | sha256sum`) is
`298816b02a437f33784c412bfb1724a31a1c0db0878cd28aeb16f4803e512639`;
it matched the working-tree diff immediately before this doc-only checkpoint.
The independent review satisfies phase 1's remaining gate; only phase 1 is done.
At that doc-only checkpoint, phases 2–4 remained pending and CHG-009 remained
active and in-progress. It recorded the supplied review outcome, not a self-review
or a new review of the changed documentation. The subsequent operator request
authorizes phase 2 only, under the execution-state boundary above.

### Phase-2 implementation and executable evidence

Phase 2 resumed the phase-1 checkpoint on `main`, with initial working-tree
fingerprint `1bcd79cac8cc4a14c9990a881771e898b543ea4128a9dcabe4169e9bb6430bc9`.
The clean sibling ZMK checkout still matched the pinned revision above.

- Shared catalog: corrected USB/BLE copy, added `OUT_NONE`, `&kt` with `keys.h`,
  parameterless `&gresc`/`&soft_off`, exact soft-off firmware note, and documented
  links. Retained `&sys_reset`/`&bootloader`; removed stock `&reset` catalog,
  documentation, and role entries. Parameterized RGB color and `&inc_dec_cp`
  remain excluded from picker promotion.
- Root cause: hydration mapped only declared root parameters before the session
  cloned its draft. It now retains excess arguments as raw subtrees while leaving
  editable-slot schemas unchanged. Nested undeclared arguments also stay raw:
  regressions exposed literal `LC` inside `WRAP(LC,2)` gaining an invented child
  through keycode lookup. Known modifier wrappers still use their declared schema.
- Focused tests cover original RED cases, promoted stock labels with excess
  arguments, command-specific arity, nested opaque tokens, declared-slot edits,
  intentional behavior replacement, generated `&kt` headers, and role exclusion.
  No session, parser, splice, or preamble-writing implementation changed.
- The sole component-test edit is the operator-approved stale assertion correction
  from `&reset` to `&sys_reset`; no component implementation or coverage was added.

| Check | Observed result |
| --- | --- |
| Reproduced phase-1 focused commands before implementation | Core exit 1: 12 failed, 20 passed; web exit 1: 7 failed, 55 passed |
| Added core role/include regressions before catalog implementation: `pnpm --filter @keymap-editor/keymap-core test -- src/behaviors.test.ts -t 'stock role\|generates keys.h'` | Exit 1; 2 failed, 32 unselected |
| `pnpm --filter @keymap-editor/keymap-core test -- src/behaviors.test.ts` after catalog implementation | Exit 0; 34 passed |
| `pnpm --filter @keymap-editor/web test -- src/lib/hydrate.test.ts src/lib/key-edit-session.test.ts` | Before hydration fix: exit 1, 14 failed/69 passed; added nested-token regressions then exposed 5 failed/83 passed; final exit 0, 88 passed (13 hydration, 75 session) |
| `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` | Exit 0; core: 58 files, 769 passed and 1 skipped (770 total); web: 67 files, 621 passed |
| `pnpm --filter @keymap-editor/keymap-core lint && pnpm --filter @keymap-editor/web lint` | Exit 0; Svelte check: 0 errors, 0 warnings |
| `pnpm records:check` | Exit 0; 3 capabilities, 10 change records, wireframe manifest in sync |
| `git diff --check` | Exit 0; no output |

The core skip is the existing optional local host-legend golden snapshot, absent
from this checkout; no test was disabled for this slice. Full-suite output includes
non-character XKB include notices and intentional mocked GitHub failure-path logs.
No firmware build, hardware action, browser/e2e gate, or phase-3 visual gate is claimed.

DOX pass: `apps/web/AGENTS.md` records the hydration/opaque-argument boundary;
`packages/keymap-core/AGENTS.md` now records the validation-only legacy-label
boundary below. Root, docs, product, and changes DOX and child indexes remain
unchanged: ownership, hierarchy, and workflow did not change. CAP-001 and
wireframes are intentionally deferred to phase 3.

### Phase-2 independent-review finding — legacy JSON validation

The operator returned a confirmed independent-review finding: removing `&reset`
from the stock picker also removed it from `validateKeymapJson`'s accepted labels.
For `{ "layers": [["&reset"]] }`, validation threw
`Key bind at "layers[0][0]" has invalid behaviour` and `isPrimaryKeymapJson`
returned `false`. Clipboard JSON was rejected, while GitHub/local primary-source
detection could fall back to `.keymap`. This is required-now phase-2 compatibility
work, not phase 3 or a general relaxation of standalone JSON validation.

- The correction started from full diff SHA-256
  `3b00427c9eb3eed8f6289cd21646a01953ae73f103e285640351a397f3b30f55`.
- `keymap.ts` now retains the exact `&reset` label in a private legacy-import set
  used only by JSON validation. Primary-source detection shares that validator.
  No alias rewrite, schema, include, picker entry, docs URL, or role was added;
  `zmk-behaviors.json`, behavior helpers, and web code were untouched by this fix.
- `keymap.test.ts` adds focused validation and primary-source regressions for
  `&reset` and `&reset WRAP(1,2) 3`, including unchanged parse/encode output.
  Unknown `&external_unknown`, lookalike `&reset_extra`, and malformed `&reset!`
  remain rejected. Existing catalog/docs/role exclusion and web no-op preservation
  regressions remain part of the verification gate.

Verification after the review correction, using Node `24.21.0` and pnpm `9.15.0`:

| Check | Observed result |
| --- | --- |
| `pnpm --filter @keymap-editor/keymap-core test -- src/keymap.test.ts -t 'legacy behavior JSON compatibility'` | Before fix: exit 1, 4 failed/3 passed/24 unselected; after fix: exit 0, 7 passed/24 unselected. Failures reproduced invalid-behaviour errors and false primary-source detection, not setup errors. |
| `pnpm --filter @keymap-editor/keymap-core test -- src/keymap.test.ts src/custom-bindings.test.ts src/behaviors.test.ts` | Exit 0; 3 files, 80 passed, including picker/docs/role exclusion and strict unknown-label controls |
| `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` | Exit 0; core: 58 files, 776 passed and 1 existing optional golden skip (777 total); web: 67 files, 621 passed |
| `pnpm lint` | Exit 0 across core, web, API, and Cloudflare; Svelte check: 0 errors, 0 warnings |
| `pnpm records:check` | Exit 0; 3 capabilities, 10 change records, wireframe manifest in sync |
| `git diff --check` | Exit 0; no output |

Diff-scope verification confirms this correction changes only `keymap.ts`,
`keymap.test.ts`, core DOX, and this CHG. The other nine pre-existing diff sections
are unchanged, and the index remains empty. At that correction checkpoint, the
finding was fixed with executable evidence and awaited independent re-approval.

**Phase-2 review outcome and handoff:** the operator reports that fresh Grok final
review of frozen diff
`85c259807c699e0c8bfd74cfa38fa4ac2ddbb43c1b4f019d993a66a0ca624b94`
returned **No findings**, confirming the corrected legacy reset JSON-import
behavior and the full phase gate recorded above. That fingerprint
(`git diff --binary | sha256sum`) matched the working-tree diff immediately before
this doc-only checkpoint. The final review satisfies phase 2's remaining review
gate; phase 2 is done. This records the supplied independent review, not a
self-review, model switch, or review of these subsequent documentation edits.

That phase-2 closeout changed only this active CHG, leaving implementation,
tests, CAP-001, wireframes, DOX, and child indexes untouched. Its checks were
`pnpm records:check` and `git diff --check`; the updated fingerprint was returned
separately from the reviewed fingerprint above. Phases 3–4 were pending at that
checkpoint. The subsequent phase-3 authorization is recorded in Execution state.

### Phase-3 implementation and executable evidence

Started by marking phase 3 in-progress, before implementation, from clean
`afcccd41ec2a436183e22abd5d2eb50db2f969da` on `main`. Node `24.21.0` and
pnpm `9.15.0` were used for every command below.

- `e2e/clipboard.spec.ts`, `CHG-009 stock picker integration`, adds nine stock
  selection cases: `OUT_NONE`, corrected USB/BLE choices, `&kt LA(F13)` and
  `&kt LALT`, `&gresc`, `&soft_off`, `&sys_reset`, and `&bootloader`. Each covers
  imported no-op Apply, selection, cancel before Apply, Apply, reopen, cancel a
  replacement, reopen/no-op Apply, and actual system-clipboard export. Assertions
  check exact binding tokens, original preamble and suffix, absent `&reset`
  picker promotion, keycode completion/keyboard activation, and parameterless flow.
- Two additional browser workflows cover legacy reset JSON with a supplied
  `.keymap` source and ten opaque DTS imports. The latter includes bare/opaque
  `&reset`, custom/nested tokens, known stock excess arguments, deprecated
  `&inc_dec_cp`, and parameterized RGB. Another key is edited to force a real
  splice; no-op Apply and canceled replacements do not alter those bindings.
- Component coverage exercises real Key/session wiring, corrected output tooltips,
  Key Toggle key/wrapper controls, staged parameterless Apply/Cancel, visible
  Soft Off prerequisites, and stock Ctrl+click docs without selecting a binding.
  Phase-2 catalog, hydration, session, validator, and core tests were not rewritten.
- The required-now preview fix uses the full session label after behavior
  synchronization; the slot preview is retained only for a pending local selection
  (or absent label). Both preview consumers in KeyEditor share this rule. Six
  component RED cases established the omitted opaque/excess-argument display;
  no parser, hydration, save, include, or source-tree behavior changed.
- CAP-001 now describes only implemented choices and bounded preservation, with
  exact test links. Only its screen definition in `wireframes/generate.mjs` was
  edited; HTML/index/manifest were regenerated and all three PNGs rendered.
  Index/manifest and CAP-002/003 artifacts remain byte-identical to HEAD.

| Check | Observed result |
| --- | --- |
| Before preview fix: `pnpm --filter @keymap-editor/web test -- src/lib/components/Keyboard/Keys/Key.test.ts -t 'previews the complete imported'` | Exit 1; six assertion failures reproduced missing opaque/excess preview arguments; 47 tests unselected, not disabled |
| After preview fix: `pnpm --filter @keymap-editor/web test -- src/lib/components/KeyEditor/KeyEditor.test.ts src/lib/components/Keyboard/Keys/Key.test.ts` | Exit 0; 76 passed across two files |
| `pnpm test:e2e e2e/clipboard.spec.ts --grep 'CHG-009 stock picker integration'` | After preview and exact-Load fixes: exit 0, initial ten cases passed; the later JSON case passed separately and all eleven passed in the full gate |
| `pnpm test:e2e e2e/clipboard.spec.ts --grep 'legacy reset JSON imports'` | Exit 0; one passed |
| `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` | Final sequential phase-3 gate exit 0: 67 web files / 638 tests; 38 Chromium e2e tests; three generated/rendered screens at 1440×1200, visible headings, no overflow/page errors; records valid (three CAPs, ten CHGs, synchronized manifest) |
| `pnpm --filter @keymap-editor/web lint` | Exit 0; Svelte check: zero errors, zero warnings |
| `pnpm --filter @keymap-editor/keymap-core test -- src/behaviors.test.ts src/keymap.test.ts src/custom-bindings.test.ts` | Exit 0; three files / 80 tests, including unchanged strict legacy JSON controls |
| `git diff --check` | Exit 0; no whitespace errors |

The final gate log is a temporary local execution artifact at
`$TMPDIR/chg-009-phase3-gate.log`, not a second progress authority. Expected
mocked GitHub failure-path logs and non-character XKB include notices remain;
no final gate failure or newly skipped test is concealed. Two intermediate
wireframe renders correctly rejected vertical overflow; the generator copy/layout
was compacted instead of bypassing renderer checks or enlarging every CAP viewport.

**Actual visual inspection:** `vision_analyze` inspected the rendered
`docs/product/wireframes/exports/CAP-001-firmware-keymap-editing.png`, including
the final full-gate re-render. It confirmed readable stock chips, Key Toggle
`&kt LA(A)` / modifier/key examples, Apply/Cancel, OUT_NONE/USB/BLE descriptions,
legacy-reset/source limits, and Soft Off firmware/hardware notice. No clipping or
overlap was found. The only caveat was compact copy and the unchanged tiny
secondary key-tile labels; the new catalog/notice text remains legible. PNG SHA-256:
`d44233cdad1cc9f6e4ca3ecb3dd6d7c037f6e6a87c4ae9a046fe9206d3ba34e9`.
This is schematic inspection, not hardware proof or independent Grok review.

**DOX pass:** updated `apps/web/AGENTS.md` with the full-draft preview contract.
Root, core, docs, product, changes, and wireframe DOX and their child indexes
remain unchanged: this slice adds no ownership boundary, workflow, hierarchy,
file format, or include-repair contract. CAP-001 remains `partial` / human;
other capabilities and architecture/ADRs are unchanged.

**Phase-3 review outcome and handoff:** the operator reports that fresh independent
Grok review of frozen diff
`2408be2be02d979e0607494e96d1ed2ff45e821a70ed18633ea331e0119b3463`
returned **No findings**, confirming browser/e2e, CAP, generated wireframe and
visual evidence. That fingerprint (`git diff --binary | sha256sum`) matched the
working-tree diff immediately before this doc-only checkpoint. The review
satisfies phase 3's remaining review gate; phase 3 is done. This records the
supplied independent review, not a self-review, model switch, or review of these
subsequent documentation edits.

That phase-3 closeout changed only this active CHG; implementation, tests, CAPs,
wireframes, DOX, and child indexes were untouched. The closeout DOX pass required
no owning-doc or index changes: only phase progress changed, not ownership,
hierarchy, contracts, or workflow. Closeout checks are `pnpm records:check` and
`git diff --check`; the updated full diff fingerprint is returned separately
from the reviewed fingerprint above to avoid a self-referential hash.
At that phase-3 checkpoint, phase 4 remained pending and had not started;
CHG-009 remained active and in-progress. No archive, staging, commit, push, deployment, credential changes,
firmware actions, new custom behavior/color editor, or include repair was
performed. Firmware compatibility remains unverified; users own includes,
`.conf`, and hardware support. Full phase-4 build/prod/Pages gates are deliberately
not claimed by this phase-3 closeout.

### Phase-4 first gate and diagnostic correction

Started from clean committed `03457f1047d78cd14ead789e9d41da9a29e21640` on
`main`, using Node `24.21.0` and pnpm `9.15.0`. Phase 4 was marked in-progress
before any gate ran. Preflight `pnpm records:check` and `git diff --check` exited
0. No live Pages target was configured; production/Pages tests use local servers,
not deployment or authenticated external services.

**Exact full gate attempted:**

`pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`

The sequential command exited **1** at `pnpm test`. Its original output is retained
at `$TMPDIR/chg-009-phase4-gate.log`; `set -o pipefail` preserved the failed exit
through `tee`. No full-gate retry was used to seek a passing random seed.

| Command reached in the exact gate | Observed result |
| --- | --- |
| `pnpm wireframes:generate` | Exit 0; three canonical screens generated |
| `pnpm wireframes:render` | Exit 0; all three PNGs rendered at 1440×1200, visible headings, no horizontal/vertical overflow or page errors |
| `pnpm records:check` | Exit 0; three CAPs, ten CHGs, manifest synchronized |
| `pnpm test` | Exit 1; core: 58 files, 776 passed / one existing optional golden skip; API: 12 files, 226 passed; web: 66 files passed / one failed, 637 tests passed / one failed. Cloudflare and record tests were not reached in this command |

**Reproduced blocker:**

- `apps/web/src/lib/editor.model.test.ts:479`, `preserves indexes, dirty flag,
  and history on random commands`, failed after two property cases with seed
  `1662916000`, shrink path `1:2`, counterexample
  `addLayer,toggleShownLayer(4),discardDraft` (command replay path `AAAAAAD:VB`).
- The assertion at `editor.model.test.ts:149` is `expected 4 to be less than 4`:
  the draft returns to four layers but `layerView.shown` still contains index 4.
- Corrected root cause: the model asserted every stored preference was in range,
  but `standardLayerView()` deliberately defaults to `[0, 1, 2, 3]` independently
  of keymap size. `effectiveShownLayers()` clips those preferences for rendering
  (`packages/keymap-core/src/layer-view.ts:56–71`); the core test at
  `layer-view.test.ts:40` explicitly covers short keymaps. The failing state renders
  `[0, 2, 3]`, not layer 4. The initial attribution to missing discard normalization
  was premature. Discard, undo and redo preserve view preferences; this failure
  establishes a test-contract mismatch, not unsafe rendered indexes.
- `git diff --exit-code 8081db012b53792a77ea555101957870fff2ecf3 HEAD -- apps/web/src/lib/editor/document.svelte.ts apps/web/src/lib/editor.model.test.ts`
  exited 0: both files are unchanged since this CHG's baseline. The minimal
  counterexample does not select stock catalog bindings or exercise their editor.
  No product/test changes or random-seed suppression were made in that initial
  diagnostic checkpoint. The later operator-approved correction targets the test.
- Diagnostic replay command:
  `pnpm --filter @keymap-editor/web exec vitest run --config "$TMPDIR/chg-009-phase4-replay.config.mjs" src/lib/editor.model.test.ts -t 'preserves indexes, dirty flag, and history on random commands'`.
  The scratch config imports the repository Vitest config and applies a narrow
  in-memory transform replacing `const FC = { numRuns: NUM_RUNS }` with the same
  run count plus `seed: 1662916000, includeErrorInReport: true`. Repository files
  remain untouched. Exit 1 reproduced the exact counterexample and assertion;
  one other test was unselected by `-t`, not disabled. Output:
  `$TMPDIR/chg-009-phase4-seed-replay.log`.
- An initial diagnostic using both seed and shrink path returned a pass
  (`$TMPDIR/chg-009-phase4-replay.log`); replaying the original seed without the
  shrink path reproduced the failure. The initial pass is not treated as a fix
  or a passing integration gate.

**Supplemental remaining checks:** executed separately after the exact gate
stopped, solely to complete verification evidence:

`pnpm --filter @keymap-editor/cloudflare test && pnpm test:records && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`

This sequential command exited 0. Output:
`$TMPDIR/chg-009-phase4-remaining-gates.log`.

| Supplemental command | Observed result |
| --- | --- |
| `pnpm --filter @keymap-editor/cloudflare test` | Exit 0; one file / 11 tests passed |
| `pnpm test:records` | Exit 0; 72 passed, zero skipped/failed |
| `pnpm lint` | Exit 0 across all workspaces; Svelte: zero errors / zero warnings |
| `pnpm build` | Exit 0 for core, web, API; Vite reports its large-chunk warning |
| `pnpm test:e2e` | Exit 0; 38 Chromium tests passed, including all eleven CHG-009 browser workflows |
| `pnpm test:e2e:prod` | Exit 0; five tests passed against local production hosting |
| `pnpm test:e2e:pages` | Exit 0; two passed / two existing conditional skips. GitHub OAuth tests skip because GitHub is deliberately disabled on static Pages (`e2e/pages/pages-smoke.spec.ts:47,65`) |

The core skip is the existing absent optional host-legend golden
(`packages/keymap-core/src/host-legend.golden.test.ts:134–139`). No tests were
disabled or weakened. Expected mocked failure-path logs and non-character XKB
notices remain. Supplemental passes do not satisfy the failed full gate.

**CAP and visual verification:** CAP-001 remains current `partial` / `human`.
Its implementation/test paths and relative links resolve; linked stock catalog,
legacy JSON, component and browser evidence was read against the named claims.
The stock-picker, legacy JSON and opaque-import browser tests passed in the
supplemental run. No CAP rewrite is needed for the implemented catalog boundary;
the model-test blocker is reported here rather than implying all linked tests pass.
All regenerated product artifacts are byte-identical to HEAD
(`git diff --exit-code -- docs/product` exit 0).

`vision_analyze` inspected the regenerated
`docs/product/wireframes/exports/CAP-001-firmware-keymap-editing.png`. It found
readable stock/parameterless chips, `&kt LA(A)` and key/wrapper choices,
Apply/Cancel staging, correct USB/BLE/NONE descriptions, Soft Off firmware/hardware
prerequisites, and legacy-reset/include-preservation limits. No visible clipping,
overlap, or misleading hardware-action claim was found; lower-panel copy is dense
but readable. This is schematic inspection, not runtime/hardware proof or Grok
review. PNG SHA-256:
`d44233cdad1cc9f6e4ca3ecb3dd6d7c037f6e6a87c4ae9a046fe9206d3ba34e9`.

**Initial blocker checkpoint:** only this active CHG changed; all DOX, CAPs,
canonical artifacts and the changes index stayed unchanged. Records and whitespace
checks passed. Phase 4 remained unfinished and CHG-009 stayed active/blocked.
Its frozen diff was `3472701770f3bc01bd6fffd75aaaef0e19ce4f6df575fa5b1b2563640fa1efe1`;
that receipt is superseded by the approved correction, not erased or treated as a
passing gate. No staging, commit, push, deployment, credential change, firmware
action, unrelated edit, or new CHG was performed.

### Phase-4 approved test-contract correction

The operator considered resetting discard to `standardLayerView()`. Scratch-only
probes showed that reset passes the captured four-layer sequence but fails the raw
invariant on a two-layer baseline and does not address undo; it also resets view
preferences. With runtime untouched, checking effective layers instead passed
the seeded model tests and explicit short-keymap/discard/undo/redo probes.
The operator approved that recommendation. The repository correction changes
only the model invariant and adds deterministic regressions; it does not change
discard, undo, redo, selection, rendering or the stock catalog, lower random run
counts, pin away failing seeds, or suppress any test.

| Correction check | Observed result |
| --- | --- |
| `pnpm --filter @keymap-editor/web test -- src/lib/editor.model.test.ts -t 'preserves view preferences'` before correcting the invariant | Exit 1; four deterministic regressions failed on the raw-index bounds assertion, two existing tests unselected. One-/two-layer defaults and discard/undo of a fifth visible layer reproduced the mismatch |
| `pnpm --filter @keymap-editor/web test -- src/lib/editor.model.test.ts` after correcting the invariant | Exit 0; all six tests passed, including both unchanged randomized properties |
| `pnpm --filter @keymap-editor/web exec vitest run --config "$TMPDIR/chg-009-phase4-replay.config.mjs" src/lib/editor.model.test.ts` | Exit 0; all six tests passed with original failing seed `1662916000`. The scratch config only supplies that seed; it does not change runtime or the corrected invariant |
| `pnpm --filter @keymap-editor/keymap-core test -- src/layer-view.test.ts` | Exit 0; ten existing tests passed |
| `pnpm records:check && git diff --check` | Exit 0 before the fresh full gate |

RED and GREEN logs: `$TMPDIR/chg-009-phase4-invariant-red.log` and
`$TMPDIR/chg-009-phase4-invariant-green.log`. The four new regressions assert exact
effective selections and unchanged stored marks/`layer0Raw`; they cover discard
on one-, two- and four-layer baselines plus undo/redo of an added visible layer.
The model still runs 50 random cases per property and retains all other invariants.
This is a test-contract correction for existing behavior, not a runtime feature.

### Phase-4 final gate and archival evidence

After the approved correction, the exact sequential command was rerun:

`pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`

It exited **0**, using Node `24.21.0` / pnpm `9.15.0` on unchanged HEAD
`03457f1047d78cd14ead789e9d41da9a29e21640` plus the documented test/record changes.
Full output: `$TMPDIR/chg-009-phase4-corrected-gate.log`. No scratch replay config
or fixed random seed was used for this full gate.

| Final gate command | Observed result |
| --- | --- |
| `pnpm wireframes:generate` | Exit 0; three canonical screens generated |
| `pnpm wireframes:render` | Exit 0; three 1440×1200 PNGs, visible headings, no horizontal/vertical overflow or page errors |
| `pnpm records:check` | Exit 0; three CAPs, ten CHGs, synchronized manifest |
| `pnpm test` | Exit 0; core: 58 files / 776 passed / one existing optional golden skip; API: 12 files / 226 passed; web: 67 files / 642 passed; Cloudflare: one file / 11 passed; record tests: 72 passed |
| `pnpm lint` | Exit 0 across all workspaces; Svelte zero errors / zero warnings |
| `pnpm build` | Exit 0 for core, web and API; existing Vite large-chunk warning |
| `pnpm test:e2e` | Exit 0; 38 passed, including all eleven CHG-009 browser workflows |
| `pnpm test:e2e:prod` | Exit 0; five passed against local production hosting |
| `pnpm test:e2e:pages` | Exit 0; two passed / two existing conditional GitHub-on-static-Pages skips |

The first failed gate remains recorded above; it was resolved by the approved
test-contract correction, not hidden by a passing random retry. No runtime code,
test count reduction, new skip, firmware configuration, credential or deployment
change was needed. Pre-archive `pnpm records:check` and `git diff --check` also
passed after the full gate.

**Final CAP/visual check:** CAP-001 remains `partial` / `human`, with unchanged
behavior and boundaries. Its verification entry now names the added model coverage;
the Key interaction link points to its actual test declaration at line 242.
All relative links, nonempty line anchors and implementation/test paths were
checked. Canonical generation/rendering remains byte-identical to HEAD
(`git diff --exit-code -- docs/product/wireframes` exit 0).
`vision_analyze` inspected the final regenerated CAP-001 PNG: all stock choices,
Key Toggle/key/wrapper controls, Apply/Cancel, output descriptions, Soft Off
prerequisites and source limits are readable without visible clipping/overlap.
Dense lower-panel text and the compact bootloader chip are minor spacing caveats,
not visual failures. The PNG hash remains
`d44233cdad1cc9f6e4ca3ecb3dd6d7c037f6e6a87c4ae9a046fe9206d3ba34e9`.

**DOX and archive:** web DOX now clarifies the existing stored-preference versus
effective-layer testing contract. Root, docs, product, changes and wireframe DOX
and child indexes stay unchanged: no ownership/hierarchy or product workflow
changes. This record moves from active to archive and the changes README removes
it from the queue, adds its done receipt and advances the queue ordering; no other
CHG is started. No review package exists to move or repair.

**Phase-4 independent-review outcome:** phase 4 and this change are done by the
passed gate and explicit archive authorization. Fresh Grok reviewed the complete
frozen patch, including the untracked archive addition, at
`d208a97462896f5b6a71b1432c8ca199aaddb6b50a7f5800283ba67fcdc1df13` and
returned **No findings**. It confirmed the patch hash and reverse-apply dry run,
the focused model tests and records check, effective-layer bounds, current CAP
anchors, archive/index lifecycle, and absence of runtime/catalog/source edits.
No staging, commit, push, deployment, credential or hardware actions occurred
during the review.
