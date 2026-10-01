/** ZMK HID OS compatibility (from the keycode catalog / docs table). */

export const KEYCODE_OS_IDS = [
  'windows',
  'linux',
  'android',
  'macos',
  'ios'
] as const

export type KeycodeOsId = (typeof KEYCODE_OS_IDS)[number]

/** `true` works, `false` does not, `null` unknown (ZMK ❔). */
export type KeycodeOsSupport = Record<KeycodeOsId, boolean | null>

const OS_LABEL: Record<KeycodeOsId, string> = {
  windows: 'Windows',
  linux: 'Linux',
  android: 'Android',
  macos: 'macOS',
  ios: 'iOS'
}

const DESKTOP_OS_IDS: KeycodeOsId[] = ['windows', 'linux', 'macos']

export function parseKeycodeOsSupport(raw: unknown): KeycodeOsSupport | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const out = {} as KeycodeOsSupport
  for (const id of KEYCODE_OS_IDS) {
    const value = row[id]
    if (value === true || value === false) out[id] = value
    else out[id] = null
  }
  return out
}

/** Every platform is explicitly supported (⭐ across the ZMK table). */
export function isKeycodeOsComplete(os: KeycodeOsSupport): boolean {
  return KEYCODE_OS_IDS.every(id => os[id] === true)
}

/**
 * Chip warning: desktop OS is known-broken, or only one desktop host is
 * confirmed while some platform is known-broken (e.g. Linux-only edit keys).
 */
export function isKeycodeOsLimited(os: KeycodeOsSupport): boolean {
  if (DESKTOP_OS_IDS.some(id => os[id] === false)) return true
  const desktopTrue = DESKTOP_OS_IDS.filter(id => os[id] === true).length
  const anyFalse = KEYCODE_OS_IDS.some(id => os[id] === false)
  return anyFalse && desktopTrue <= 1
}

function listOs(
  os: KeycodeOsSupport,
  predicate: (value: boolean | null) => boolean
): string[] {
  return KEYCODE_OS_IDS.filter(id => predicate(os[id])).map(id => OS_LABEL[id])
}

/** Multi-line OS summary for tooltips; null when every host is confirmed. */
export function formatKeycodeOsTooltip(os: KeycodeOsSupport): string | null {
  if (isKeycodeOsComplete(os)) return null
  const works = listOs(os, value => value === true)
  const missing = listOs(os, value => value === false)
  const unknown = listOs(os, value => value === null)
  const lines: string[] = []
  if (works.length) lines.push(`Works on ${works.join(' · ')}`)
  if (missing.length) lines.push(`Not on ${missing.join(' · ')}`)
  if (unknown.length) lines.push(`Unknown on ${unknown.join(' · ')}`)
  return lines.length ? lines.join('\n') : null
}

/** Read `os` from a catalog choice row when the binder passed it through. */
export function choiceKeycodeOs(choice: {
  os?: unknown
}): KeycodeOsSupport | null {
  return parseKeycodeOsSupport(choice.os)
}

export function choiceOsSupportLimited(choice: { os?: unknown }): boolean {
  const os = choiceKeycodeOs(choice)
  return os != null && isKeycodeOsLimited(os)
}
