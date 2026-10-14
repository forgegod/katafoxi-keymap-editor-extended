# ADR 0002: Keymap file contract — save paths, JSON priority, `#define` macros

- **Status:** Accepted
- **Date:** 2026-09-22

## Context

The original editor’s everyday path is **`keymap.json`** (plus layout from `info.json`). This fork also loads and saves raw ZMK **`.keymap`** so boards like LARK (preamble `#define` / `#include`, custom `&mt` / `&lt` blocks) stay usable.

Without a fixed contract, Save can silently overwrite a hand-maintained `.keymap` with the default “THIS FILE WAS GENERATED” template, or Local, GitHub, and Clipboard can disagree on load. Implementing parse/splice once in `keymap-core` is required by [ADR 0001](0001-persistence-github-first.md).

“Macros” here means **C-style `#define` aliases** in `.keymap` text (e.g. `#define VU C_VOL_UP`), not ZMK `&macro` behaviors in the editor UI.

## Decision

### Save — `buildKeymapCode` order

| Priority | Condition | Mode | Effect on `.keymap` |
|----------|-----------|------|---------------------|
| 1 | `*.keymap.template` present | `template` | Full generate from template (`{{rendered_layers}}`, etc.) |
| 2 | Else existing `.keymap` text (`originalSource`) | `splice` | Replace only `bindings = <...>` inside `keymap { compatible = "zmk,keymap"; ... }`. Preamble, includes, and behavior nodes outside those bindings stay. |
| 3 | Else neither | `default_template` | Default generated template + warning `generated_default_template` |

- Layer length must equal layout key count before write (fail; do not truncate).
- Splice must not treat combo/other `bindings =` outside the ZMK keymap block as layers.
- Existing layer **node ids** are kept by index; UI `layer_names` do not rename DTS nodes. New layers use `layer_N`.
- When `conditionalLayers` is present, every save path rewrites the root `conditional_layers` node from that list. An empty list removes the node. When the field is absent, an existing node is left unchanged.
- When `holdTaps` is present, every save path rewrites hold-tap timing from that list and inserts missing nodes. When the field is absent, existing hold-tap nodes are left unchanged.
- When `sensorBindings` is present, every save path rewrites each layer's `sensor-bindings` from that list. An empty inner list removes the property on that layer. When the field is absent, existing sensor lines are left unchanged.
- When `&uc` is used, every save path ensures `#include <behaviors/unicode.dtsi>` exists. Splice adds only a missing header before the first DTS node, retaining preceding preprocessor setup and existing header spelling. The module manifest and host setup remain user-managed; see [Unicode picker](../unicode-picker.md).

Local, GitHub, and Clipboard adapters all call the same `buildKeymapCode` helper.

### Load priority

1. Prefer `keymap.json` when it exists and `layers` are non-empty and valid.
2. Otherwise read raw `.keymap` → `parseDtsKeymap` (then the usual parse/encode path).
3. Never treat `*.keymap.template` as the keymap file to overwrite as “the” source keymap.

After the first successful Save, `keymap.json` is written and becomes the primary reload source (bindings may already be expanded — see below).

### `#define` macros — lossy accept

1. On DTS import, simple `#define NAME replacement` aliases used in bindings are **expanded** (`VU` → `C_VOL_UP`, `BT1` → `BT_SEL 1`).
2. On Save (splice or generate), **bindings** are written with expanded tokens, not the short alias.
3. `#define` lines in the preamble may remain after splice but can become unused (“orphaned”).
4. Emit warning `macros_expanded` when defines were used in bindings. Surface warnings in the UI.
5. **No reverse substitution** in this decision (writing `VU` back from `C_VOL_UP` is a future feature if needed).

This does not remove the original editor’s `keymap.json` workflow; it documents the cost of the DTS import/save extension.

### Interchange

- `keymap.json` remains the editor interchange format (aligned with upstream).
- Product GitHub path, the Clipboard **Copy .keymap** path, and the dev-local bridge share this contract via core.

## CHG-004 amendment — selected GitHub file ownership

This amendment implements the operator-approved CHG-004 persistence policy;
it does not change this ADR's original acceptance date or claim that the pending
picker/recovery interactions have shipped. Local and Clipboard retain the above
contract. Independent phase review remains required by CHG-004.

- GitHub identity includes the exact repository, explicit branch and direct
  `config/<filename>.keymap` path. Inventory comes from a complete recursive git
  tree pinned to the resolved head. Only regular blobs are eligible; unsafe,
  encoded, nested, symlink and template paths cannot become selections. A sole
  candidate may default only without an explicit path. An absent explicit path
  never falls back to another file.
- The durable mode marker is `config/.keymap-editor.json`, with exactly
  `{ "version": 1, "mode": "scoped" }`. Its absence must be proved from the
  complete pinned tree. Exactly one candidate with no marker or scoped evidence
  is legacy mode. Multiple candidates without prior scoped evidence initialize
  scoped mode on their first successful write. A valid marker keeps scoped mode
  after data deletion or candidate-count shrinkage. Invalid/unreadable markers,
  incomplete trees, or marker absence conflicting with scoped artifacts or the
  caller's previously established scoped mode refuse writes. Manual marker
  removal is not reverse migration. The marker is never automatically deleted.
- Legacy mode retains `config/keymap.json` as primary and as output, without
  consent prompts, marker creation or path migration. Scoped mode uses only
  `config/<full-keymap-filename>.json` (e.g. `config/a.keymap.json`). Shared JSON
  remains unassigned and untouched. Missing/invalid scoped JSON falls back to
  the selected DTS with an explicit status, never another file's JSON.
- Creating/replacing missing/invalid scoped JSON when legacy JSON exists requires
  explicit choice of validated legacy JSON or acceptance of the selected DTS.
  Consent carries repository, branch, selected path, pinned head SHA and chosen
  input (`legacy` or `dts`); changed identity/revision invalidates it. A load with
  `jsonSource=legacy` exposes the validated adoption model; ordinary load exposes
  DTS until owned JSON exists. Edits to that selected model remain ordinary
  edits, not consent. Refused consent/validation mutates no git objects. Consent
  chooses firmware input only, not firmware-only host publication.
- Scoped templates match the exact selected path plus `.template`. Legacy mode
  additionally permits a sole unmatched template, never a guess among several.
  Without a template, splice the selected existing source; disappearance is an
  error, not permission to create a replacement or use the default template.
- Legacy geometry retains shared `config/info.json` priority. Scoped geometry
  uses only the safe matching `<stem>.json`, excluding reserved `info.json` and
  `keymap.json`, otherwise binding-count inference with a warning. Geometry and
  templates are read-only. Existing owned sidecars must be regular blobs; unsafe
  ownership/types and invalid supplied geometry refuse the entire write.
- GitHub browser identity keys are versioned and include the exact selected
  path; non-GitHub keys retain their semantics. Unscoped legacy rows stay intact
  and unattached unless a separately confirmed, verified sole-file adoption is
  performed. A filename or matching keyboard/layout is not ownership proof.

## Consequences

### Positive

- LARK-style preambles survive Save path 2.
- Local, GitHub, and Clipboard stay on one implementation.
- Users and agents get an explicit warning instead of silent `#define` drift.
- Classic JSON-only boards behave like the original editor.

### Negative / trade-offs

- Round-trip of alias names in bindings is lossy until reverse-sub exists.
- After Save, reload from `keymap.json` shows expanded codes even if the `.keymap` preamble still lists `#define`.
- Path 1 (template) fully controls the file; path 3 is a last resort and must stay noisy (warning).
- Splice does not sync `{{behaviour_includes}}`. Besides layer binding interiors, it rewrites `combos` and `conditional_layers` when those fields are set. When `holdTaps` is set, it also rewrites tapping term, flavor, quick-tap, and prior-idle inside existing hold-tap nodes and `&code { … }` timing blocks, inserts missing nodes, and drops a timing block the list no longer has. When `holdTaps` is absent, those nodes stay untouched. When `sensorBindings` is set, it rewrites each layer's `sensor-bindings` (an empty list drops the property). When the field is absent, those lines stay.

## References

- Implementation: `packages/keymap-core` (`buildKeymapCode`, `dts-splice`, `dts-conditional-layers`, `dts-sensors`, `parseDtsKeymap`)
- Adapters: `apps/api` local + GitHub save/load; Clipboard export in `apps/web/src/lib/clipboard/`
- Operator notes: [running-locally.md](../../running-locally.md)
- Vision: [TARGET_SYSTEM.md](../TARGET_SYSTEM.md)
- Persistence boundary: [ADR 0001](0001-persistence-github-first.md)
