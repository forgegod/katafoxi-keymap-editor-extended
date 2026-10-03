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
  },
  it: {
    // Primary Italian; oracle tmp/mklc/it.klc (it_142.klc is 00010410).
    localeName: 'it-IT',
    localeId: '00000410',
    languageName: 'Italian (Italy)',
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
  pt: {
    // Portugal (xkb `pt`); oracle tmp/mklc/pt.klc.
    localeName: 'pt-PT',
    localeId: '00000816',
    languageName: 'Portuguese (Portugal)',
    shiftStates: [0, 1, 2, 6],
    vkByZmk: {
      MINUS: 'OEM_4',
      EQUAL: 'OEM_6',
      LBKT: 'OEM_PLUS',
      RBKT: 'OEM_1',
      SEMI: 'OEM_3',
      GRAVE: 'OEM_5',
      BSLH: 'OEM_2',
      SLASH: 'OEM_MINUS'
    }
  },
  br: {
    // ABNT2; oracle tmp/mklc/pt_ABNT2.klc (pt_ABNT.klc is older 00000416).
    localeName: 'pt-BR',
    localeId: '00010416',
    languageName: 'Portuguese (Brazil)',
    shiftStates: [0, 1, 2, 6]
  },
  cs: {
    localeName: 'cs-CZ',
    localeId: '00000405',
    languageName: 'Czech (Czech Republic)',
    shiftStates: [0, 1, 2, 6],
    vkByZmk: {
      MINUS: 'OEM_PLUS',
      EQUAL: 'OEM_2',
      SLASH: 'OEM_MINUS'
    },
    // Caps Lock letters on the number row / punctuation (tmp/mklc/cs.klc).
    sgcapByZmk: {
      N2: 0x011a,
      N3: 0x0160,
      N4: 0x010c,
      N5: 0x0158,
      N6: 0x017d,
      N7: 0x00dd,
      N8: 0x00c1,
      N9: 0x00cd,
      N0: 0x00c9,
      LBKT: 0x00da,
      SEMI: 0x016e
    }
  },
  da: {
    localeName: 'da-DK',
    localeId: '00000406',
    languageName: 'Danish (Denmark)',
    shiftStates: [0, 1, 2, 6],
    vkByZmk: {
      MINUS: 'OEM_PLUS',
      EQUAL: 'OEM_4',
      LBKT: 'OEM_6',
      RBKT: 'OEM_1',
      SEMI: 'OEM_3',
      GRAVE: 'OEM_5',
      BSLH: 'OEM_2',
      SLASH: 'OEM_MINUS'
    }
  },
  sv: {
    localeName: 'sv-SE',
    localeId: '0000041d',
    languageName: 'Swedish (Sweden)',
    shiftStates: [0, 1, 2, 6],
    vkByZmk: {
      MINUS: 'OEM_PLUS',
      EQUAL: 'OEM_4',
      LBKT: 'OEM_6',
      RBKT: 'OEM_1',
      SEMI: 'OEM_3',
      GRAVE: 'OEM_5',
      BSLH: 'OEM_2',
      SLASH: 'OEM_MINUS'
    }
  },
  hu: {
    localeName: 'hu-HU',
    localeId: '0000040e',
    languageName: 'Hungarian (Hungary)',
    shiftStates: [0, 1, 2, 6],
    vkByZmk: {
      N0: 'OEM_3',
      MINUS: 'OEM_2',
      GRAVE: '0',
      SLASH: 'OEM_MINUS'
    }
  },
  tr: {
    localeName: 'tr-TR',
    localeId: '0000041f',
    languageName: 'Turkish (Turkey)',
    shiftStates: [0, 1, 2, 6, 7],
    vkByZmk: {
      MINUS: 'OEM_8',
      EQUAL: 'OEM_MINUS',
      BSLH: 'OEM_COMMA',
      COMMA: 'OEM_2',
      DOT: 'OEM_5',
      SLASH: 'OEM_PERIOD'
    }
  },
  ro: {
    // xkb ro(basic) is programmers; Windows KLID 00020418.
    localeName: 'ro-RO',
    localeId: '00020418',
    languageName: 'Romanian (Romania)',
    shiftStates: [0, 1, 2, 6, 7]
  },
  fi: {
    // Oracle tmp/mklc/fi.klc — Nordic OEM map like da/sv/no.
    localeName: 'fi-FI',
    localeId: '0000040b',
    languageName: 'Finnish (Finland)',
    shiftStates: [0, 1, 2, 6],
    vkByZmk: {
      MINUS: 'OEM_PLUS',
      EQUAL: 'OEM_4',
      LBKT: 'OEM_6',
      RBKT: 'OEM_1',
      SEMI: 'OEM_3',
      GRAVE: 'OEM_5',
      BSLH: 'OEM_2',
      SLASH: 'OEM_MINUS'
    }
  },
  no: {
    // Oracle tmp/mklc/no.klc (nb-NO).
    localeName: 'nb-NO',
    localeId: '00000414',
    languageName: 'Norwegian (Bokmål)',
    shiftStates: [0, 1, 2, 6],
    vkByZmk: {
      MINUS: 'OEM_PLUS',
      EQUAL: 'OEM_4',
      LBKT: 'OEM_6',
      RBKT: 'OEM_1',
      SEMI: 'OEM_3',
      GRAVE: 'OEM_5',
      BSLH: 'OEM_2',
      SLASH: 'OEM_MINUS'
    }
  },
  el: {
    // Oracle tmp/mklc/gr.klc — US-like VKs; no punctuation remap needed.
    localeName: 'el-GR',
    localeId: '00000408',
    languageName: 'Greek (Greece)',
    shiftStates: [0, 1, 2, 6]
  },
  bg: {
    // Oracle tmp/mklc/bg.klc — BDS (KLID 00030402); Q/DOT VKs differ from US.
    localeName: 'bg-BG',
    localeId: '00030402',
    languageName: 'Bulgarian (Bulgaria)',
    shiftStates: [0, 1, 2],
    vkByZmk: {
      EQUAL: 'OEM_PERIOD',
      Q: 'OEM_COMMA',
      COMMA: 'OEM_8',
      DOT: 'Q',
      SLASH: 'OEM_2'
    },
    sgcapByZmk: {
      Q: 0x042b,
      A: 0x042c
    }
  }
}

export function windowsLocale(language: HostLanguageId): WindowsLocale {
  return WINDOWS_LOCALES[language]
}
