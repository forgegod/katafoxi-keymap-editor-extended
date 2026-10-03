/**
 * Windows locale data for .klc export.
 *
 * Letter virtual keys are inferred from the character on the key, so a new
 * language does not need a VK map for QWERTY / AZERTY / QWERTZ letters.
 * `vkByZmk` is only for punctuation keys whose VK is not the US one
 * (German `ß` is `OEM_4`, not `OEM_MINUS`). Dead-key accents live in
 * `klc-dead.ts`. `deadIdByKeysym` overrides the spacing character when
 * Windows uses a different one for the same accent. `sgcapByZmk` is the
 * caps-lock character when it is not the shift glyph (Czech number row).
 */

import type { HostLanguageId } from './host-languages.js'

export interface WindowsLocale {
  /** BCP 47 tag written to LOCALENAME (`de-DE`). */
  readonly localeName: string
  /** Eight-digit keyboard language id written to LOCALEID (`00000407`). */
  readonly localeId: string
  /** English name written to LANGUAGENAMES. */
  readonly languageName: string
  /**
   * SHIFTSTATE column ids. 0 base, 1 shift, 2 ctrl, 6 AltGr, 7 AltGr+Shift.
   * The writer adds 6 or 7 when the layout uses those levels and this list
   * omitted them.
   */
  readonly shiftStates: readonly number[]
  /** VK spelling without the `VK_` prefix, keyed by ZMK name. */
  readonly vkByZmk?: Readonly<Record<string, string>>
  /** Spacing character for a `dead_*` keysym, when it differs from the shared table. */
  readonly deadIdByKeysym?: Readonly<Record<string, number>>
  /** Caps-lock character that replaces the shift glyph. Codepoint. */
  readonly sgcapByZmk?: Readonly<Record<string, number>>
}

/**
 * One object per host language. Adding a language fails the build until
 * this record has an entry: locale id and shift states are the required part.
 */
export const WINDOWS_LOCALES: Record<HostLanguageId, WindowsLocale> = {
  en: {
    localeName: 'en-US',
    localeId: '00000409',
    languageName: 'English (United States)',
    shiftStates: [0, 1, 2]
  },
  ru: {
    localeName: 'ru-RU',
    localeId: '00000419',
    languageName: 'Russian (Russia)',
    shiftStates: [0, 1, 2, 6]
  },
  uk: {
    localeName: 'uk-UA',
    localeId: '00000422',
    languageName: 'Ukrainian (Ukraine)',
    shiftStates: [0, 1, 2, 6, 7]
  },
  de: {
    localeName: 'de-DE',
    localeId: '00000407',
    languageName: 'German (Germany)',
    shiftStates: [0, 1, 2, 6, 7],
    vkByZmk: {
      MINUS: 'OEM_4',
      EQUAL: 'OEM_6',
      LBKT: 'OEM_1',
      RBKT: 'OEM_PLUS',
      SEMI: 'OEM_3',
      GRAVE: 'OEM_5',
      BSLH: 'OEM_2',
      SLASH: 'OEM_MINUS'
    }
  },
  fr: {
    localeName: 'fr-FR',
    localeId: '0000040c',
    languageName: 'French (France)',
    shiftStates: [0, 1, 2, 6],
    // AZERTY punctuation VKs from stock MSKLC (tmp/mklc/fr.klc). Letter VKs
    // follow the Latin letter on the key (Q→A, W→Z, …).
    vkByZmk: {
      MINUS: 'OEM_4',
      LBKT: 'OEM_6',
      RBKT: 'OEM_1',
      SQT: 'OEM_3',
      GRAVE: 'OEM_7',
      M: 'OEM_COMMA',
      COMMA: 'OEM_PERIOD',
      DOT: 'OEM_2',
      SLASH: 'OEM_8'
    }
  },
  pl: {
    // Polish programmers (AltGr) — matches xkb pl(basic); oracle pl_prog.klc.
    localeName: 'pl-PL',
    localeId: '00000415',
    languageName: 'Polish (Poland)',
    shiftStates: [0, 1, 2, 6, 7]
  },
  es: {
    localeName: 'es-ES',
    localeId: '0000040a',
    languageName: 'Spanish (Spain)',
    shiftStates: [0, 1, 2, 6],
    vkByZmk: {
      MINUS: 'OEM_4',
      EQUAL: 'OEM_6',
      LBKT: 'OEM_1',
      RBKT: 'OEM_PLUS',
      SEMI: 'OEM_3',
      GRAVE: 'OEM_5',
      BSLH: 'OEM_2',
      SLASH: 'OEM_MINUS'
    }
  }
}

export function windowsLocale(language: HostLanguageId): WindowsLocale {
  return WINDOWS_LOCALES[language]
}
