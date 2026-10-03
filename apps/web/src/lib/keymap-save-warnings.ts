/** Optional link shown under a load/save warning in the chrome notice. */
export type KeymapWarningLink = {
  href: string
  label: string
}

export type KeymapWarningNotice = {
  message: string
  link?: KeymapWarningLink
}

/** Shared examples for building a real ZMK `info.json` physical layout. */
export const INFO_JSON_EXAMPLES_LINK: KeymapWarningLink = {
  href: 'https://github.com/nickcoutsos/keymap-editor-contrib/tree/main/keyboard-data',
  label: 'Browse example info.json layouts'
}

/** User-facing text for save/load warning codes from core and adapters. */
export const KEYMAP_SAVE_WARNING_MESSAGES: Record<string, string> = {
  macros_expanded:
    'Macros were expanded to raw keycodes (for example VU → C_VOL_UP). #define lines in the keymap may now be unused.',
  generated_default_template:
    'No existing keymap or template was used — output uses the default ZMK template. Paste a .keymap on Load (or under Export source) next time to keep includes and behavior blocks.',
  clipboard_json_no_export_source:
    'Loaded from keymap.json only — Copy .keymap will use the default ZMK template unless you also paste a .keymap under “Export source”.',
  clipboard_inferred_layout:
    'No info.json — using a flat rectangular board from the binding count. Paste info.json for the real layout.',
  github_inferred_layout:
    'No config/info.json — using a flat rectangular board from the binding count. Commit still updates the keymap only; add info.json for the real geometry.'
}

const WARNING_LINKS: Partial<Record<string, KeymapWarningLink>> = {
  clipboard_inferred_layout: INFO_JSON_EXAMPLES_LINK,
  github_inferred_layout: INFO_JSON_EXAMPLES_LINK
}

export function formatKeymapSaveWarningNotices(
  warnings: unknown
): KeymapWarningNotice[] {
  if (!Array.isArray(warnings) || warnings.length === 0) return []
  return warnings.map(code => {
    const key = String(code)
    return {
      message: KEYMAP_SAVE_WARNING_MESSAGES[key] ?? key,
      link: WARNING_LINKS[key]
    }
  })
}

export function formatKeymapSaveWarnings(warnings: unknown): string[] {
  return formatKeymapSaveWarningNotices(warnings).map(notice => notice.message)
}
