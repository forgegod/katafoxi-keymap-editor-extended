import { primarySystemLayoutId } from './host-layout-catalog.js'
import type { HostLanguageId } from './host-languages.js'
import type { HostLayout } from './host-layout.js'
import { hostLayout } from './host-layout-registry.js'
import type { KeyBindingNode, ParsedKeymap } from './types.js'

/**
 * Keypad page glyphs the OS emits without reading the language layout.
 * `KP_DOT` and `KP_COMMA` stay out: they follow the locale decimal separator.
 * A shifted alias such as `PLUS` (`LS(EQUAL)`) is not here; the host layout reads that report.
 */
const KEYPAD_GLYPH_BY_CODE: ReadonlyMap<string, string> = new Map([
  ['KP_N0', '0'],
  ['KP_NUMBER_0', '0'],
  ['KP_N1', '1'],
  ['KP_NUMBER_1', '1'],
  ['KP_N2', '2'],
  ['KP_NUMBER_2', '2'],
  ['KP_N3', '3'],
  ['KP_NUMBER_3', '3'],
  ['KP_N4', '4'],
  ['KP_NUMBER_4', '4'],
  ['KP_N5', '5'],
  ['KP_NUMBER_5', '5'],
  ['KP_N6', '6'],
  ['KP_NUMBER_6', '6'],
  ['KP_N7', '7'],
  ['KP_NUMBER_7', '7'],
  ['KP_N8', '8'],
  ['KP_NUMBER_8', '8'],
  ['KP_N9', '9'],
  ['KP_NUMBER_9', '9'],
  ['KP_PLUS', '+'],
  ['KP_MINUS', '-'],
  ['KP_SUBTRACT', '-'],
  ['KP_SLASH', '/'],
  ['KP_DIVIDE', '/']
])

/**
 * Letters a host language is expected to type. Ukrainian is not Russian:
 * і ї є ґ stand in, and ы э ъ ё do not. German adds ä ö ü ß; French adds
 * accented vowels and æ œ ç; Polish adds ą ć ę ł ń ó ś ź ż; Spanish adds ñ
 * and acute vowels. A letter the primary system layout never produces is
 * not required (`missingBasicGlyphs`).
 */
const LETTERS: Record<HostLanguageId, string> = {
  en: 'abcdefghijklmnopqrstuvwxyz',
  ru: 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
  uk: 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя',
  de: 'abcdefghijklmnopqrstuvwxyzäöüß',
  fr: 'abcdefghijklmnopqrstuvwxyzàâäæçéèêëîïôœùûüÿ',
  pl: 'abcdefghijklmnopqrstuvwxyząćęłńóśźż',
  es: 'abcdefghijklmnopqrstuvwxyzñáéíóúü',
  it: 'abcdefghijklmnopqrstuvwxyzàèéìíîòóùú',
  pt: 'abcdefghijklmnopqrstuvwxyzáàâãçéêíóôõú',
  br: 'abcdefghijklmnopqrstuvwxyzáàâãçéêíóôõú',
  cs: 'aábcčdďeéěfghiíjklmnňoópqrřsštťuúůvwxyýzž',
  da: 'abcdefghijklmnopqrstuvwxyzæøå',
  sv: 'abcdefghijklmnopqrstuvwxyzåäö',
  hu: 'aábcdeéfghiíjklmnoóöőpqrstuúüűvwxyz',
  tr: 'abcçdefgğhıijklmnoöprsştuüvyz',
  ro: 'aăâbcdefghiîjklmnopqrsștțuvwxyz'
}

/** Digits plus typewriter punctuation and the shifted partner of each mark. */
const MARKS = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  ';',
  ':',
  '/',
  '?',
  '\\',
  '|',
  "'",
  '"',
  '-',
  '_',
  '=',
  '+',
  '[',
  '{',
  ']',
  '}',
  ',',
  '<',
  '.',
  '>'
] as const

/**
 * Typewriter punctuation Differences treats as serious (Linux split / per-key gap).
 * Digits stay out; national marks (`№`, …) stay ornament. Grave and tilde join the
 * punct half of `MARKS`.
 */
export const BASIC_ALIGN_GLYPHS: ReadonlySet<string> = new Set([
  ';',
  ':',
  '/',
  '?',
  '\\',
  '|',
  "'",
  '"',
  '-',
  '_',
  '=',
  '+',
  '[',
  '{',
  ']',
  '}',
  ',',
  '<',
  '.',
  '>',
  '`',
  '~'
])

export function isBasicAlignGlyph(glyph: string): boolean {
  return BASIC_ALIGN_GLYPHS.has(glyph)
}

const stockGlyphs = new Map<HostLanguageId, Set<string>>()

function glyphsOf(layout: HostLayout): Set<string> {
  const found = new Set<string>()
  for (const row of layout.byZmk.values()) {
    for (const glyph of row.glyphs) {
      if (glyph) found.add(glyph)
    }
  }
  return found
}

function hasLetter(found: Set<string>, letter: string): boolean {
  const lower = letter.toLowerCase()
  for (const glyph of found) {
    if (glyph.toLowerCase() === lower) return true
  }
  return false
}

/** Glyphs the language's primary system layout produces. Cached: builtins do not change. */
function stockOf(language: HostLanguageId): Set<string> {
  const cached = stockGlyphs.get(language)
  if (cached) return cached
  const id = primarySystemLayoutId(language)
  const layout = id ? hostLayout(id) : undefined
  const found = layout ? glyphsOf(layout) : new Set<string>()
  stockGlyphs.set(language, found)
  return found
}

function keypadCode(token: string): string {
  const name = token.trim().toUpperCase().replace(/^KC_/, '')
  return name
}

function visitBinding(node: KeyBindingNode, visit: (token: string) => void): void {
  visit(String(node.value))
  for (const child of node.params ?? []) visitBinding(child, visit)
}

/**
 * Glyphs a keymap types from the keypad page (`KP_N3`, `KP_PLUS`).
 * The same set covers every host language: the OS does not consult that layout.
 */
export function keypadCoveredGlyphs(keymap: ParsedKeymap | null | undefined): Set<string> {
  const covered = new Set<string>()
  if (!keymap) return covered
  for (const layer of keymap.layers) {
    for (const binding of layer) {
      visitBinding(binding, token => {
        const glyph = KEYPAD_GLYPH_BY_CODE.get(keypadCode(token))
        if (glyph) covered.add(glyph)
      })
    }
  }
  return covered
}

/**
 * Basic letters, digits, and punctuation this layout does not contain.
 * A letter is present when either case appears on any level.
 * A glyph the primary system layout never produces is not required.
 * `covered` glyphs (keypad keys on this keymap) count as present.
 */
export function missingBasicGlyphs(
  layout: HostLayout,
  language: HostLanguageId,
  covered?: ReadonlySet<string>
): string[] {
  const found = glyphsOf(layout)
  const stock = stockOf(language)
  const missing: string[] = []
  for (const letter of LETTERS[language]) {
    if (!hasLetter(stock, letter) || hasLetter(found, letter)) continue
    missing.push(letter)
  }
  for (const mark of MARKS) {
    if (!stock.has(mark) || found.has(mark) || covered?.has(mark)) continue
    missing.push(mark)
  }
  return missing
}
