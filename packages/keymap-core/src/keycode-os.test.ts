import { describe, expect, it } from 'vitest'
import {
  formatKeycodeOsTooltip,
  isKeycodeOsComplete,
  isKeycodeOsLimited,
  parseKeycodeOsSupport,
  type KeycodeOsSupport
} from './keycode-os.js'
import { catalogChoiceTooltip } from './keycode-labels.js'
import { normalizeZmkKeycodes } from './keycodes.js'

const full: KeycodeOsSupport = {
  windows: true,
  linux: true,
  android: true,
  macos: true,
  ios: true
}

describe('keycode OS support', () => {
  it('treats all-true as complete and not limited', () => {
    expect(isKeycodeOsComplete(full)).toBe(true)
    expect(isKeycodeOsLimited(full)).toBe(false)
    expect(formatKeycodeOsTooltip(full)).toBeNull()
  })

  it('flags desktop false and linux-only edit-style rows as limited', () => {
    expect(
      isKeycodeOsLimited({
        windows: false,
        linux: true,
        android: true,
        macos: true,
        ios: null
      })
    ).toBe(true)
    expect(
      isKeycodeOsLimited({
        windows: null,
        linux: true,
        android: false,
        macos: null,
        ios: null
      })
    ).toBe(true)
    expect(
      isKeycodeOsLimited({
        windows: null,
        linux: true,
        android: false,
        macos: true,
        ios: true
      })
    ).toBe(false)
  })

  it('formats works / not / unknown lines for tooltips', () => {
    expect(
      formatKeycodeOsTooltip({
        windows: null,
        linux: true,
        android: true,
        macos: false,
        ios: false
      })
    ).toBe(
      'Works on Linux · Android\nNot on macOS · iOS\nUnknown on Windows'
    )
  })

  it('parses catalog os blobs and keeps null unknowns', () => {
    expect(
      parseKeycodeOsSupport({
        windows: true,
        linux: false,
        android: 'nope',
        macos: null
      })
    ).toEqual({
      windows: true,
      linux: false,
      android: null,
      macos: null,
      ios: null
    })
  })

  it('copies os onto normalized keycodes', () => {
    const [row] = normalizeZmkKeycodes([
      {
        names: ['K_MUTE2'],
        description: 'Mute',
        os: {
          windows: null,
          linux: true,
          android: true,
          macos: false,
          ios: false
        }
      }
    ])
    expect(row?.os).toEqual({
      windows: null,
      linux: true,
      android: true,
      macos: false,
      ios: false
    })
  })

  it('appends OS details to choice tooltips when present', () => {
    expect(
      catalogChoiceTooltip({
        code: 'K_MUTE2',
        description: 'Mute',
        os: {
          windows: null,
          linux: true,
          android: true,
          macos: false,
          ios: false
        }
      })
    ).toBe(
      'K_MUTE2 — Mute\nWorks on Linux · Android\nNot on macOS · iOS\nUnknown on Windows'
    )
    expect(catalogChoiceTooltip({ code: 'M', description: 'm and M' })).toBe(
      'M — m and M'
    )
  })
})
