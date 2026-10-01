/**
 * Color scheme preference (user choice) vs resolved scheme (what CSS uses).
 * Preference persists in localStorage; resolved value is set on <html data-color-scheme>.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ColorScheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'color-scheme-preference'

const PREFERENCES: ThemePreference[] = ['system', 'light', 'dark']

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function readThemePreference(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null
): ThemePreference {
  if (!storage) return 'system'
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function writeThemePreference(
  preference: ThemePreference,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null
): void {
  if (!storage) return
  try {
    storage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    /* private mode / quota — keep in-memory only */
  }
}

export function resolveColorScheme(
  preference: ThemePreference,
  prefersDark = typeof matchMedia !== 'undefined'
    ? matchMedia('(prefers-color-scheme: dark)').matches
    : false
): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference
  return prefersDark ? 'dark' : 'light'
}

export function cycleThemePreference(
  preference: ThemePreference
): ThemePreference {
  const index = PREFERENCES.indexOf(preference)
  return PREFERENCES[(index + 1) % PREFERENCES.length]
}

export function applyColorScheme(
  scheme: ColorScheme,
  root: HTMLElement = document.documentElement
): void {
  root.dataset.colorScheme = scheme
  root.style.colorScheme = scheme
}

/** Read preference, resolve, write dataset. Returns the applied scheme. */
export function applyThemePreference(
  preference: ThemePreference,
  options: {
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null
    root?: HTMLElement
    prefersDark?: boolean
  } = {}
): ColorScheme {
  const storage =
    options.storage === undefined
      ? typeof localStorage !== 'undefined'
        ? localStorage
        : null
      : options.storage
  writeThemePreference(preference, storage)
  const scheme = resolveColorScheme(preference, options.prefersDark)
  if (options.root || typeof document !== 'undefined') {
    applyColorScheme(scheme, options.root ?? document.documentElement)
  }
  return scheme
}

export function themePreferenceLabel(preference: ThemePreference): string {
  if (preference === 'light') return 'Light'
  if (preference === 'dark') return 'Dark'
  return 'System'
}

export function themeToggleTitle(preference: ThemePreference): string {
  const next = cycleThemePreference(preference)
  return `Theme: ${themePreferenceLabel(preference)}. Click for ${themePreferenceLabel(next).toLowerCase()}.`
}
