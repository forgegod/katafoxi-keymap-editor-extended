# CHG-009 — Correct stock ZMK behavior catalog

**Status:** in-progress
**External request:** Direct operator request: Continue as proposed creating a new CHG
**Impacts:** CAP-001
**Baseline:** `8081db012b53792a77ea555101957870fff2ecf3` on main; recheck branch, working-tree ownership, and the ZMK source revision before execution.
**Priority:** P1 — catalog correctness before further picker work

## Current boundary

CHG-001 adds `BT_DISC`, `BT_CLR_ALL`, `RGB_ON`, and `RGB_OFF`. A subsequent comparison with local ZMK main at `5b51501f` found catalog defects outside that closed scope:

- `&out` omits `OUT_NONE`, and its `OUT_USB` / `OUT_BLE` descriptions are reversed from ZMK.
- Stock bindings `&kt`, `&gresc`, and `&soft_off` are absent from the picker.
- `&reset` is advertised as a stock binding even though this ZMK revision defines `&sys_reset` and `&bootloader` instead.

The catalog remains a picker aid, not a claim that every arbitrary source behavior is schema-editable. Existing unknown bindings and parameters must remain source-preserving.

Local ZMK source evidence is `../zmkfirmware-zmk/docs/docs/keymaps/behaviors/index.mdx`, `../zmkfirmware-zmk/docs/docs/keymaps/behaviors/outputs.md`, and the matching DTS/header files. Phase-2 implementation evidence is recorded below; phase-3 browser integration and current-state CAP/visual updates remain pending.

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
| 3 | Integrate the picker and current-state visual | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

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

Phase 1 started from clean `main` at `67b1fe53153ddb5ddfcb7d6cd2a5b423b7be423b`
after CHG-002 archival and is complete following independent review. Phase 2 is
done following the full phase gate and operator-reported fresh Grok final review:
shared catalog correctness, opaque-argument preservation, and corrected legacy
reset JSON-import compatibility only. Phases 3–4 remain pending and CHG-010 remains planned. Node
`24.21.0` and pnpm `9.15.0` are verified. The operator approved one exception to
the component-test boundary: change only the stale stock `&reset` assertion in
`KeyEditor.test.ts` to `&sys_reset`. No other KeyEditor component/e2e, CAP, or
wireframe work, staging, commit, push, deployment, or credential changes are
authorized. This doc-only checkpoint closes phase 2, not CHG-009; the change
remains active and in-progress, with no authorization to start phase 3.

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

Only this active CHG is changed by the closeout. Implementation, tests, CAP-001,
and wireframes remain untouched. DOX and child indexes remain unchanged because
this checkpoint changes phase progress only, not ownership, hierarchy, contracts,
or workflow. Closeout checks are `pnpm records:check` and `git diff --check`; the
updated full diff fingerprint is returned to the operator after these edits,
separately from the reviewed fingerprint above. Phases 3–4 remain pending and
CHG-009 remains active and in-progress; do not start phase 3, stage, commit, push,
deploy, or change credentials in this handoff.
