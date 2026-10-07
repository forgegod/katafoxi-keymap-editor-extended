import { ALT_LEVEL_EMPTY } from './host-layout.js'
import type { ComposedLegend, ComposedLegendColumn } from './types.js'

export type KeycapTone = 'base' | 'second'

export interface KeycapFaceGlyph {
  text: string
  /** Spacing mark for a `dead_*` keysym. */
  dead?: boolean
  /** AltGr or AltGr+Shift level. */
  alt: boolean
  /**
   * Level placeholder (`ˬ`): NoSymbol, or AltGr column toggle off.
   * Always present in the face; SPA shows it on hover only.
   */
  empty?: boolean
}

/**
 * One on-keycap language: exactly four glyphs (base, shift, AltGr, AltGr+Shift).
 * Empty / toggle-off levels are `ˬ` (`empty: true`). Never collapsed or omitted.
 */
export interface KeycapFacePack {
  tone: KeycapTone
  glyphs: readonly [KeycapFaceGlyph, KeycapFaceGlyph, KeycapFaceGlyph, KeycapFaceGlyph]
}

/**
 * Board face only. Agents and UI use this — not a second packing helper.
 * Four slots per on-keycap language (≤2), then optional hold. Empty = `ˬ`.
 * No `/`, no collapsing shared letters, no dropping empty languages on the key.
 */
export interface KeycapFace {
  packs: KeycapFacePack[]
  hold?: string
}

/** Left slot keeps its own tone. Two drawn languages use base then second so the pair can be told apart. */
function keycapTone(column: ComposedLegendColumn, drawn: readonly ComposedLegendColumn[]): KeycapTone {
  if (drawn.length < 2) return column.tone
  return drawn[0] === column ? 'base' : 'second'
}

function faceGlyph(text: string, alt: boolean, dead?: boolean): KeycapFaceGlyph {
  if (!text) return { text: ALT_LEVEL_EMPTY, alt, empty: true }
  return dead ? { text, alt, dead: true } : { text, alt }
}

/**
 * Four levels for one on-keycap language.
 * `showAltGr` / `showAltGrShift` false → `ˬ` even when the layout has a glyph
 * (column toggle hides the level; the slot stays).
 */
function packLanguage(
  column: ComposedLegendColumn,
  drawn: readonly ComposedLegendColumn[]
): KeycapFacePack {
  return {
    tone: keycapTone(column, drawn),
    glyphs: [
      faceGlyph(column.pair[0] ?? '', false, column.pairDead[0]),
      faceGlyph(column.pair[1] ?? '', false, column.pairDead[1]),
      faceGlyph(column.showAltGr ? column.altGr : '', true, Boolean(column.showAltGr && column.altGrDead)),
      faceGlyph(
        column.showAltGrShift ? column.altGrShift : '',
        true,
        Boolean(column.showAltGrShift && column.altGrShiftDead)
      )
    ]
  }
}

/**
 * Fill the composed keycap face — the only board content API.
 *
 * 1. Take on-keycap languages (at most two), left to right.
 * 2. For each, emit exactly four levels: base, shift, AltGr, AltGr+Shift.
 *    Empty or toggle-off levels are `ˬ`. Shared letter pairs are not collapsed.
 * 3. Attach `legend.hold` when present (`⧗⌃`, …) — behavior chrome, not a host level.
 *
 * The SPA paints this face, scale-to-fits, and shows `ˬ` only on layer hover.
 */
export function keycapFace(legend: ComposedLegend): KeycapFace {
  const drawn = legend.columns.filter(column => column.onKeycap)
  const packs = drawn.map(column => packLanguage(column, drawn))
  return legend.hold ? { packs, hold: legend.hold } : { packs }
}

/** Compact face string for tests and debug (`bBˬˬиИˬˬ`, `kK]}лЛ]} ⧗⌃`). */
export function formatKeycapFace(face: KeycapFace): string {
  const body = face.packs.map(pack => pack.glyphs.map(glyph => glyph.text).join('')).join('')
  return face.hold ? `${body} ${face.hold}`.trim() : body
}
