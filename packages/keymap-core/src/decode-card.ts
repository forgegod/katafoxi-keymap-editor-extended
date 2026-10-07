import { encodeKeyBinding } from './keymap.js'
import { hostKeyByZmk } from './host-key-id.js'
import {
  ALT_LEVEL_EMPTY,
  hostDisplayLevels,
  hostLevelDisplay,
  type HostKeyLevels
} from './host-layout.js'
import { hostLayoutShelves, hostLevels } from './host-layout-registry.js'
import { standardHostLegendView } from './host-legend-view.js'
import type { HostLanguageId } from './host-languages.js'
import type { HostLegendView, KeyBindingNode } from './types.js'
import { formatHoldBadge, resolveBinding } from './compose-binding.js'
import { resolveHostColumns, type ResolvedHostColumn } from './compose-host.js'

export interface LegendDecodeSlot {
  text: string
  /** True when this current-row cell differs from the language's primary system. */
  differs: boolean
  /** Spacing glyph for a `dead_*` keysym (not a composed character). */
  dead: boolean
}

export interface LegendDecodeColumn {
  language: HostLanguageId
  /** Same flag as the host-legend strip for the column's current layout. */
  flag: string
  /** Same tone as `keycapFace` packs: first column `base`, later columns `second`. */
  tone: 'base' | 'second'
  slots: [LegendDecodeSlot, LegendDecodeSlot, LegendDecodeSlot, LegendDecodeSlot]
}

/** Full host decode for a composed-row tooltip: ids + optional system/current grid. */
export interface LegendDecodeCard {
  binding: string
  keycode?: string
  vk?: string
  evdevName?: string
  hold?: string
  current: LegendDecodeColumn[]
  /** Omitted when every shown language matches its primary system layout. */
  system: LegendDecodeColumn[] | null
}

export function formatDecodeWord(column: Pick<LegendDecodeColumn, 'slots'>): string {
  return column.slots.map(slot => slot.text).join('')
}

/** HID / ZMK id without a `KC_` prefix the decode card stores for display. */
export function stripKcPrefix(code: string | undefined | null): string {
  if (!code) return ''
  return code.replace(/^KC_/, '')
}

function decodeSlot(keysym: string): LegendDecodeSlot {
  const display = hostLevelDisplay(keysym)
  return {
    text: display.text || ALT_LEVEL_EMPTY,
    differs: false,
    dead: display.dead
  }
}

/** Decode grid from stored keysyms so `dead_*` shows its spacing mark. */
function slotsFromKeyLevels(levels: HostKeyLevels): LegendDecodeColumn['slots'] {
  return [
    decodeSlot(levels.keysyms[0]),
    decodeSlot(levels.keysyms[1]),
    decodeSlot(levels.keysyms[2]),
    decodeSlot(levels.keysyms[3])
  ]
}

/** Character keys and dead-key keys; skip pure modifiers (`Multi_key`, level3). */
function levelsBelongInDecode(levels: HostKeyLevels): boolean {
  return hostDisplayLevels(levels) != null
}

function emptySlots(): LegendDecodeColumn['slots'] {
  return [
    { text: ALT_LEVEL_EMPTY, differs: false, dead: false },
    { text: ALT_LEVEL_EMPTY, differs: false, dead: false },
    { text: ALT_LEVEL_EMPTY, differs: false, dead: false },
    { text: ALT_LEVEL_EMPTY, differs: false, dead: false }
  ]
}

function markDiffs(
  current: LegendDecodeColumn[],
  system: LegendDecodeColumn[]
): { current: LegendDecodeColumn[]; system: LegendDecodeColumn[] | null } {
  let any = false
  const marked = current.map(column => {
    const baseline = system.find(item => item.language === column.language)
    if (!baseline) return column
    const slots = column.slots.map((slot, index) => {
      const base = baseline.slots[index]
      const differs = slot.text !== base.text || slot.dead !== base.dead
      if (differs) any = true
      return { ...slot, differs }
    }) as LegendDecodeColumn['slots']
    return { ...column, slots }
  })
  return { current: marked, system: any ? system : null }
}

/**
 * Identifiers plus a 4-level grid per shown language.
 * The faded system row is the language's primary OS layout (`us` / `winkeys`).
 */
export function composeLegendDecode(
  binding: KeyBindingNode,
  view?: HostLegendView
): LegendDecodeCard {
  const resolved = resolveBinding(binding)
  const host = resolved.tap ? hostKeyByZmk(resolved.tap) : undefined
  const card: LegendDecodeCard = {
    binding: encodeKeyBinding(binding),
    keycode: host ? `KC_${host.zmk}` : undefined,
    vk: host?.vk,
    evdevName: host?.evdevName,
    hold: resolved.hold ? formatHoldBadge(resolved.hold) : undefined,
    current: [],
    system: null
  }
  if (!host) return card

  const hostView = view ?? standardHostLegendView()
  const current: LegendDecodeColumn[] = []
  const system: LegendDecodeColumn[] = []
  for (const column of resolveHostColumns(hostView).filter(item => item.shown)) {
    const levels = hostLevels(column.layoutId, host.zmk)
    if (!levels || !levelsBelongInDecode(levels)) continue
    current.push({
      language: column.language,
      flag: column.flag,
      tone: column.tone,
      slots: slotsFromKeyLevels(levels)
    })
    const primary = hostLayoutShelves(column.language).primary
    const sysLevels = primary ? hostLevels(primary.id, host.zmk) : undefined
    system.push({
      language: column.language,
      flag: column.flag,
      tone: column.tone,
      slots:
        sysLevels && levelsBelongInDecode(sysLevels)
          ? slotsFromKeyLevels(sysLevels)
          : emptySlots()
    })
  }
  const compared = markDiffs(current, system)
  card.current = compared.current
  card.system = compared.system
  return card
}

function systemDecodeColumns(
  shown: ResolvedHostColumn[],
  zmk: string
): LegendDecodeColumn[] {
  return shown.map(column => {
    const primary = hostLayoutShelves(column.language).primary
    const sysLevels = primary ? hostLevels(primary.id, zmk) : undefined
    return {
      language: column.language,
      flag: column.flag,
      tone: column.tone,
      slots:
        sysLevels && levelsBelongInDecode(sysLevels)
          ? slotsFromKeyLevels(sysLevels)
          : emptySlots()
    }
  })
}

/**
 * Fill empty editable columns for shown languages that `composeLegendDecode`
 * skipped because the layout has no record for the key. Rebuilds the system
 * row for every shown language so a gap does not drop the other columns.
 * Keeps the hover-only decode snapshot unchanged (golden) while the edit
 * card can open a missing key.
 */
export function withEditableLegendDecodeGaps(
  card: LegendDecodeCard,
  view?: HostLegendView
): LegendDecodeCard {
  if (!card.keycode) return card
  const zmk = stripKcPrefix(card.keycode)
  const hostView = view ?? standardHostLegendView()
  const shown = resolveHostColumns(hostView).filter(item => item.shown)
  const current = [...card.current]
  let changed = false
  for (const column of shown) {
    if (current.some(item => item.language === column.language)) continue
    if (hostLevels(column.layoutId, zmk)) continue
    current.push({
      language: column.language,
      flag: column.flag,
      tone: column.tone,
      slots: emptySlots()
    })
    changed = true
  }
  if (!changed) return card
  const order = shown.map(column => column.language)
  const byLanguage = (columns: LegendDecodeColumn[]) =>
    [...columns].sort(
      (a, b) => order.indexOf(a.language) - order.indexOf(b.language)
    )
  const compared = markDiffs(byLanguage(current), systemDecodeColumns(shown, zmk))
  return { ...card, current: compared.current, system: compared.system }
}
