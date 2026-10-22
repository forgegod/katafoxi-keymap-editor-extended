# Editor design language

## Authority and reference sources

These are contributor and AI-agent rules for maintaining the existing editor, not a claim that every current surface already complies. Implementation progress belongs to the owning CHG; CAPs describe tested runtime behavior.

Use these source references together:

- `apps/web/src/app.css` — semantic colors, both themes, typography, chrome height and overlay stack.
- `apps/web/src/lib/components/ComboPanel.svelte` — compact panel, header, property groups, fields and action hierarchy.
- `apps/web/src/lib/components/Combo.css` — dense secondary button treatment.
- `apps/web/src/lib/components/Common/Button.svelte` — reusable ordinary actions, semantic variants, hover, disabled and keyboard-focus states.
- `apps/web/src/lib/components/Common/Modal.svelte` — dialog semantics, focus trap, Escape, focus return and portal placement.

The source selector is `.combo-panel`, with the accessible name `Combos`. Never depend on generated `svelte-*` class suffixes: they are build artifacts, not design identifiers.

## Theme, color and meaning

- Use semantic custom properties from `app.css`; do not introduce feature-local hex palettes, literal white/black surfaces or a separate dark-only theme. Add a shared role only when an existing role cannot express the meaning, and define it for both themes.
- Use `--surface` for the ordinary editor shell, `--surface-sunken` for inset controls/groups, `--border` and the softer border roles for boundaries, and `--text` / `--text-muted` for primary and supporting copy. Use shade-based `color-mix` for subtle washes so they invert with the theme.
- Use `--accent` for ordinary interaction, focus and selected-state emphasis. Solid green means ready firmware publication or selected-key state, not generic Save/Apply inside a staged dialog. Host-install readiness uses the existing green wash. Destructive actions use danger tokens; warnings use `--warn*`, not a new feature color or an undefined `--warning` role.
- Preserve documented domain-specific exceptions. CAP-002 explicitly makes Filesystem Grant write access red; this permission warning is not an ordinary neutral action to recolor during an unrelated cleanup. Host decode/install surfaces retain their warm `--paper*` family. Code previews may use existing code tokens, not a new palette.
- Never copy a fallback color or missing state from an older component merely because that component is a visual reference. The shared tokens and semantic contracts take precedence.

## Typography and density

- Inherit the application font for controls; native button/input typography must not introduce a second UI font. Keep monospace for source, bindings and other code content, not ordinary action labels.
- Use the shared chrome scale: `--font-xs` 11px, `--font-sm` 12px, `--font-md` 13px, `--font-lg` 15px and `--font-xl` 18px. `--font-icon` is 16px. Keycap/decode glyph content is a separate contract; do not resize it as chrome.
- Use compact hierarchy: a short named header, restrained supporting copy, grouped settings, then local actions. Avoid browser-default heading/paragraph margins and oversized feature-local headings.
- Keep ordinary toolbar buttons at `--chrome-h` (30px). Dense panel controls are a distinct context, not a reason to shrink every shared button: Combos currently uses 22px buttons, 24px text inputs and a 20px quiet variant. Any new compact shared treatment must be explicit and tested; preserve ordinary chrome sizing.

## Panels, fields and spacing

- Follow the Combos hierarchy, not its exact sidebar dimensions. Its shell uses an 8px radius, 8px/10px padding, a 6px content gap and a subtle 1px shade border; its inset property group uses a 6px radius, 7px/8px padding and a sunken wash. Dialogs may be wider and use their existing modal elevation; do not force them into a 16rem sidebar.
- Group related fields in compact sections. Use layout `gap` for consistent spacing rather than accumulating per-button margins. The reference action gap is 4px and the header gap is 8px; keep the same restrained density when wrapping.
- Style text/number inputs, selects and textareas intentionally: inherited typography, token-based foreground/background, a 1px border, a small radius, consistent padding and a visible focus state. Keep native checkbox/select semantics; do not replace them with inaccessible decorative elements.
- Use `box-sizing: border-box`, shrinkable children and wrapping action rows. At narrow widths, stack or wrap fields and labels without clipping actions. Preserve source text with wrapping or a bounded preview scroller, never silent truncation.
- Keep dialogs inside the viewport with one owning main vertical scroll region. A bounded source preview may scroll independently. Preserve the existing 1280×720 and 360×640 containment contract; hiding overflow is not a fix for unreachable controls.

## Buttons and interaction states

- Use `Common/Button.svelte` for ordinary chrome and dialog actions. Choose its existing `outline`, `accent`, `accentOutline`, `danger`, `publish`, `softReady` or `icon` variant by meaning. A staged confirmation may be accent; it must not impersonate publication.
- A raw semantic `<button>` is allowed for a specialized board/chip/drag control or an established dense control, but it needs an explicit shared or local styling contract. A class name, a margin-only rule, or a user-agent default is not a styling contract. Do not restyle every button globally or reuse a feature-specific `.combo-btn` class in unrelated features.
- If ordinary actions require a compact size, extend the existing shared primitive with an explicit size contract rather than copying its CSS into each feature. That extension is implementation work, not an API that already exists.
- Cover resting, hover, `:focus-visible`, disabled and selected/pressed states where relevant. Preserve a visible keyboard-focus outline; the shared reference is 2px `--accent` with 1px offset. Disabled controls must remain visibly distinct and genuinely disabled, not just faded clickable text.
- Keep destructive labels and disabled/refusal reasons understandable without color. Preserve accessible names, explicit button types, form semantics, shortcut hints, focus return and existing staged Apply/Cancel boundaries. Styling never grants source ownership or bypasses a guard.
- Do not target Svelte hash classes or rely on a parent's scoped selector reaching into a child component. Check how shared-component classes and sidecar styles actually reach the rendered element.

## Required workflow for future UI changes

1. Read the applicable DOX chain and this contract. Identify the closest established reference and existing primitive before adding styles.
2. Review every state changed by the feature, not just its toolbar launcher: empty/list, form, invocation, source preview, validation/read-only and disabled/busy states as applicable.
3. Verify rendered computed typography, surfaces, borders, semantic variants, focus and disabled treatment in both light and dark themes. A raw-button count, a class assertion or happy-dom alone cannot prove styling. Compare equivalent roles; compact controls need not equal toolbar dimensions.
4. Exercise keyboard activation, Tab focus, Escape and focus return, and check desktop/narrow wrapping and scroll reachability with real browser tests. Preserve existing transaction/source-preservation tests.
5. Capture and inspect representative rendered application states in both themes. Do not call an uninspected screenshot visually approved. Name the bounded state/viewport coverage rather than claiming an all-screen audit.
6. For material surface changes, update the affected CAP, behavior/style evidence and canonical generator/HTML/PNG in the same implementation slice. Canonical schematics and application screenshots serve different purposes; neither substitutes for browser assertions. Pending visual proposals stay in CHG review packages, never the current product inventory.
7. Run the affected web tests and lint, browser gates and record validator. Follow the owning CHG's integration gate before closure. Keep CSS sidecars split; follow the root Vite HMR rule rather than inlining a stylesheet to mask a cache failure.

No universal style-conformance test currently enforces this entire document. Future changes must supply focused browser evidence for their touched surfaces; do not imply that `pnpm records:check` establishes visual correctness.
