/**
 * Light / dark color scheme. Preference persists in localStorage;
 * the resolved value is set on <html data-color-scheme>.
 */

export type ColorScheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'color-scheme-preference'
/** First visit / empty storage — dark reads better for the dense keymap UI. */
export const DEFAULT_COLOR_SCHEME: ColorScheme = 'dark'

export function isColorScheme(value: unknown): value is ColorScheme {
  return value === 'light' || value === 'dark'
}

export function readColorScheme(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null
): ColorScheme {
  if (!storage) return DEFAULT_COLOR_SCHEME
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY)
    // Legacy "system" (and anything else) falls back to the default.
    return isColorScheme(raw) ? raw : DEFAULT_COLOR_SCHEME
  } catch {
    return DEFAULT_COLOR_SCHEME
  }
}

export function writeColorScheme(
  scheme: ColorScheme,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null
): void {
  if (!storage) return
  try {
    storage.setItem(THEME_STORAGE_KEY, scheme)
  } catch {
    /* private mode / quota — keep in-memory only */
  }
}

export function toggleColorScheme(scheme: ColorScheme): ColorScheme {
  return scheme === 'dark' ? 'light' : 'dark'
}

export function applyColorScheme(
  scheme: ColorScheme,
  root: HTMLElement = document.documentElement
): void {
  root.dataset.colorScheme = scheme
  root.style.colorScheme = scheme
}

/** Persist and apply. Returns the applied scheme. */
export function applyThemePreference(
  scheme: ColorScheme,
  options: {
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null
    root?: HTMLElement
  } = {}
): ColorScheme {
  const storage =
    options.storage === undefined
      ? typeof localStorage !== 'undefined'
        ? localStorage
        : null
      : options.storage
  writeColorScheme(scheme, storage)
  if (options.root || typeof document !== 'undefined') {
    applyColorScheme(scheme, options.root ?? document.documentElement)
  }
  return scheme
}

export function colorSchemeLabel(scheme: ColorScheme): string {
  return scheme === 'light' ? 'Light' : 'Dark'
}

export function themeToggleTitle(scheme: ColorScheme): string {
  const next = toggleColorScheme(scheme)
  return `Theme: ${colorSchemeLabel(scheme)}. Click for ${colorSchemeLabel(next).toLowerCase()}.`
}
