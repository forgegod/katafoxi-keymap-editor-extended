/** User-facing text for save/load warning codes from core and clipboard adapters. */
export const KEYMAP_SAVE_WARNING_MESSAGES: Record<string, string> = {
  macros_expanded:
    'Macros were expanded to raw keycodes (for example VU → C_VOL_UP). #define lines in the keymap may now be unused.',
  generated_default_template:
    'No existing keymap or template was used — output uses the default ZMK template. Paste a .keymap on Load (or under Export source) next time to keep includes and behavior blocks.',
  clipboard_json_no_export_source:
    'Loaded from keymap.json only — Copy .keymap will use the default ZMK template unless you also paste a .keymap under “Export source”.',
  clipboard_inferred_layout:
    'No info.json — using a flat rectangular board from the binding count. Paste info.json for the real layout.'
}

export function formatKeymapSaveWarnings(warnings: unknown): string[] {
  if (!Array.isArray(warnings) || warnings.length === 0) return []
  return warnings.map(code => {
    const key = String(code)
    return KEYMAP_SAVE_WARNING_MESSAGES[key] ?? key
  })
}
