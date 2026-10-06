import { getBehaviorCatalog, type BehaviorCatalog } from './catalog.js'
import type { CatalogChoice } from './catalog-choices.js'
import { holdTapPresetFor, holdTapTimingNote } from './dts-behaviors.js'
import type { BehaviorDef, ZmkHoldTap } from './types.js'

/**
 * Role order for the behaviour row: key input, layers, device, then
 * parameterless bindings. Unknown codes follow the same buckets.
 */
export const BEHAVIOR_ROLE_ORDER = [
  '&kp',
  '&mkp',
  '&msc',
  '&mmv',
  '&mt',
  '&lt',
  '&sk',
  '&mo',
  '&to',
  '&tog',
  '&sl',
  '&bt',
  '&out',
  '&rgb_ug',
  '&bl',
  '&ext_power',
  '&trans',
  '&none',
  '&caps_word',
  '&key_repeat',
  '&reset',
  '&bootloader'
] as const

export function isInstantBehavior(choice: {
  params?: unknown[]
}): boolean {
  return !Array.isArray(choice.params) || choice.params.length === 0
}

/** Mouse-emulation bindings that need firmware pointing support. */
export const POINTING_BEHAVIORS = ['&mkp', '&msc', '&mmv'] as const

export function isPointingBehavior(code: string | number | undefined | null): boolean {
  return (POINTING_BEHAVIORS as readonly string[]).includes(String(code))
}

const POINTING_FIRMWARE_NOTE =
  'Firmware: CONFIG_ZMK_POINTING=y in the keyboard .conf. This editor only adds #include <dt-bindings/zmk/pointing.h> to the keymap.'

/**
 * Behaviours that do nothing until a Kconfig flag (default off).
 * The editor only injects the keymap include, not `*.conf`.
 * Bluetooth and output selection are on in a normal wireless build.
 */
const FIRMWARE_NOTES: Record<string, string> = {
  '&mkp': POINTING_FIRMWARE_NOTE,
  '&msc': POINTING_FIRMWARE_NOTE,
  '&mmv': POINTING_FIRMWARE_NOTE,
  '&bl':
    'Firmware: CONFIG_ZMK_BACKLIGHT=y in the keyboard .conf. This editor only adds #include <dt-bindings/zmk/backlight.h> to the keymap.',
  '&rgb_ug':
    'Firmware: CONFIG_ZMK_RGB_UNDERGLOW=y in the keyboard .conf. This editor only adds #include <dt-bindings/zmk/rgb.h> to the keymap.'
}

export function behaviorFirmwareNote(
  code: string | number | undefined | null
): string | null {
  if (code == null || code === '') return null
  return FIRMWARE_NOTES[String(code)] ?? null
}

/**
 * Short English peek for the decode card — what the behaviour does,
 * not a docs dump. Layer / hold-tap / sticky families only; `&kp` stays silent.
 */
const PEEK_NOTES: Record<string, string> = {
  '&mo': 'Hold to activate the layer; release returns.',
  '&to': 'Switch to that layer and stay there (other non-default layers turn off).',
  '&tog': 'Toggle the layer on or off with each press.',
  '&sl': 'Activates the layer until the next keypress (sticky).',
  '&lt': 'Hold for the layer; tap for the key.',
  '&mt': 'Hold for the modifier; tap for the key.',
  '&sk': 'Holds the modifier until the next keypress (sticky).'
}

/** One-line behaviour hint shown on the hover decode card. */
export function behaviorPeekNote(
  code: string | number | undefined | null
): string | null {
  if (code == null || code === '') return null
  return PEEK_NOTES[String(code)] ?? null
}

/**
 * First value-slot param and, for command behaviours, the command list.
 * Used by the key editor so `&mkp` / `&msc` / `&mmv` do not fall back
 * to the Keyboard+Keypad keycode grid.
 */
export function behaviorValueCatalog(
  code: string | number | undefined | null
): { param?: string; choices: CatalogChoice[] } {
  const def = getBehaviorCatalog().byCode[String(code ?? '')]
  if (!def) return { choices: [] }
  const param = typeof def.params?.[0] === 'string' ? def.params[0] : undefined
  if (param === 'command') {
    return {
      param,
      choices: (def.commands ?? []).map(command => ({ ...command }))
    }
  }
  return { param, choices: [] }
}

/**
 * Param the value grid should list. The active slot wins when this
 * behaviour actually has it (`&mt` modifier, then key). A leftover
 * keycode slot on `&mkp` stays on the command list.
 */
export function behaviorSlotParam(
  code: string | number | undefined | null,
  slotParam: unknown
): string | undefined {
  const def = getBehaviorCatalog().byCode[String(code ?? '')]
  if (!def) {
    return typeof slotParam === 'string' && slotParam !== 'behaviour' ? slotParam : undefined
  }
  const params = (def.params ?? []).filter((param): param is string => typeof param === 'string')
  if (typeof slotParam === 'string' && params.includes(slotParam)) return slotParam
  return params[0]
}

export function sortBehaviorsByRole<T extends { code?: string | number; params?: unknown[] }>(
  list: T[]
): T[] {
  return [...list].sort((a, b) => {
    const ia = BEHAVIOR_ROLE_ORDER.indexOf(String(a.code) as (typeof BEHAVIOR_ROLE_ORDER)[number])
    const ib = BEHAVIOR_ROLE_ORDER.indexOf(String(b.code) as (typeof BEHAVIOR_ROLE_ORDER)[number])
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    const aInstant = isInstantBehavior(a)
    const bInstant = isInstantBehavior(b)
    if (aInstant !== bInstant) return aInstant ? 1 : -1
    return String(a.code ?? '').localeCompare(String(b.code ?? ''))
  })
}

/**
 * Stock catalog plus hold-tap nodes from this keymap.
 * Named nodes become chips. Timing blocks annotate the behaviour they name.
 * Does not mutate the shared catalog.
 */
export function mergeHoldTapCatalog(
  catalog: BehaviorCatalog,
  holdTaps: ZmkHoldTap[] | undefined
): BehaviorCatalog {
  if (!holdTaps?.length) return catalog
  const list = catalog.list.map(behavior => ({ ...behavior }))
  const byCode: Record<string, BehaviorDef> = Object.fromEntries(list.map(behavior => [behavior.code, behavior]))
  for (const holdTap of holdTaps) {
    const summary = holdTapTimingNote(holdTap)
    const existing = byCode[holdTap.code]
    if (holdTap.override) {
      if (!existing || !summary) continue
      const name = String(existing.name ?? existing.code)
      existing.description = `${name}, ${summary}`
      if (holdTap.tappingTermMs != null) existing.tappingTermMs = holdTap.tappingTermMs
      if (holdTap.quickTapMs != null) existing.quickTapMs = holdTap.quickTapMs
      if (holdTap.requirePriorIdleMs != null) {
        existing.requirePriorIdleMs = holdTap.requirePriorIdleMs
      }
      if (holdTap.flavor) existing.flavor = holdTap.flavor
      continue
    }
    const preset = holdTapPresetFor(holdTap.code)
    const params = preset
      ? [...preset.params]
      : holdTap.params?.length
        ? [...holdTap.params]
        : ['code', 'code']
    const name = preset?.name ?? 'Hold-tap'
    const created: BehaviorDef = {
      code: holdTap.code,
      name,
      description: summary ? `${name}, ${summary}` : (preset?.description ?? 'Hold-tap'),
      params,
      holdTap: true,
      ...(holdTap.tappingTermMs != null ? { tappingTermMs: holdTap.tappingTermMs } : {}),
      ...(holdTap.quickTapMs != null ? { quickTapMs: holdTap.quickTapMs } : {}),
      ...(holdTap.requirePriorIdleMs != null
        ? { requirePriorIdleMs: holdTap.requirePriorIdleMs }
        : {}),
      ...(holdTap.flavor ? { flavor: holdTap.flavor } : {})
    }
    if (existing) {
      Object.assign(existing, created)
    } else {
      list.push(created)
      byCode[created.code] = created
    }
  }
  return { list, byCode }
}
