import { describe, expect, it } from 'vitest'
import {
  applyColorScheme,
  applyThemePreference,
  colorSchemeLabel,
  isColorScheme,
  readColorScheme,
  themeToggleTitle,
  THEME_STORAGE_KEY,
  toggleColorScheme,
  writeColorScheme
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

describe('color scheme', () => {
  it('defaults to dark when storage is empty, invalid, or legacy system', () => {
    expect(readColorScheme(memoryStorage())).toBe('dark')
    expect(readColorScheme(memoryStorage({ [THEME_STORAGE_KEY]: 'nope' }))).toBe(
      'dark'
    )
    expect(readColorScheme(memoryStorage({ [THEME_STORAGE_KEY]: 'system' }))).toBe(
      'dark'
    )
  })

  it('round-trips a stored scheme', () => {
    const storage = memoryStorage()
    writeColorScheme('light', storage)
    expect(readColorScheme(storage)).toBe('light')
  })

  it('toggles dark ↔ light', () => {
    expect(toggleColorScheme('dark')).toBe('light')
    expect(toggleColorScheme('light')).toBe('dark')
  })

  it('writes data-color-scheme on the root', () => {
    const root = document.createElement('html')
    applyColorScheme('dark', root)
    expect(root.dataset.colorScheme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
  })

  it('applyThemePreference stores and applies', () => {
    const storage = memoryStorage()
    const root = document.createElement('html')
    const scheme = applyThemePreference('dark', { storage, root })
    expect(scheme).toBe('dark')
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(root.dataset.colorScheme).toBe('dark')
  })

  it('labels and toggle title stay in English', () => {
    expect(colorSchemeLabel('dark')).toBe('Dark')
    expect(themeToggleTitle('light')).toMatch(/Dark/i)
    expect(isColorScheme('light')).toBe(true)
    expect(isColorScheme('system')).toBe(false)
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
    expect(readColorScheme(broken)).toBe('dark')
    expect(() => writeColorScheme('light', broken)).not.toThrow()
  })
})
