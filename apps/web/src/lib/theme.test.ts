import { describe, expect, it } from 'vitest'
import {
  applyColorScheme,
  applyThemePreference,
  cycleThemePreference,
  isThemePreference,
  readThemePreference,
  resolveColorScheme,
  themePreferenceLabel,
  themeToggleTitle,
  THEME_STORAGE_KEY,
  writeThemePreference
} from './theme'

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    key() {
      return null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    }
  }
}

describe('theme preference', () => {
  it('reads system when storage is empty or invalid', () => {
    expect(readThemePreference(memoryStorage())).toBe('system')
    expect(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: 'nope' }))).toBe(
      'system'
    )
  })

  it('round-trips a stored preference', () => {
    const storage = memoryStorage()
    writeThemePreference('dark', storage)
    expect(readThemePreference(storage)).toBe('dark')
  })

  it('resolves system from prefers-color-scheme', () => {
    expect(resolveColorScheme('system', true)).toBe('dark')
    expect(resolveColorScheme('system', false)).toBe('light')
    expect(resolveColorScheme('light', true)).toBe('light')
    expect(resolveColorScheme('dark', false)).toBe('dark')
  })

  it('cycles system → light → dark → system', () => {
    expect(cycleThemePreference('system')).toBe('light')
    expect(cycleThemePreference('light')).toBe('dark')
    expect(cycleThemePreference('dark')).toBe('system')
  })

  it('writes data-color-scheme on the root', () => {
    const root = document.createElement('html')
    applyColorScheme('dark', root)
    expect(root.dataset.colorScheme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
  })

  it('applyThemePreference stores and resolves', () => {
    const storage = memoryStorage()
    const root = document.createElement('html')
    const scheme = applyThemePreference('dark', {
      storage,
      root,
      prefersDark: false
    })
    expect(scheme).toBe('dark')
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(root.dataset.colorScheme).toBe('dark')
  })

  it('labels and toggle title stay in English', () => {
    expect(themePreferenceLabel('system')).toBe('System')
    expect(themeToggleTitle('light')).toMatch(/Dark/i)
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('neon')).toBe(false)
  })

  it('survives storage throwing', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      }
    }
    expect(readThemePreference(broken)).toBe('system')
    expect(() => writeThemePreference('light', broken)).not.toThrow()
  })
})
