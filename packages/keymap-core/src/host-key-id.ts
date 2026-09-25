/**
 * One physical key, named four ways.
 *
 * ZMK `A` is USB HID Keyboard usage 0x04. Linux calls that evdev `KEY_A`
 * (30) and XKB `<AC01>` (keycode 38 = evdev + 8). Windows MSKLC calls it
 * `VK_A` (0x41). Host compose joins on this row: a `.keymap` token and a
 * symbols / .klc name are the same key.
 *
 * Shift aliases (`COLON` = `LS(SEMI)`) are not rows. They are a modifier
 * plus the base HID key.
 *
 * Sources: USB HID Usage Tables (Keyboard/Keypad page, as in ZMK
 * `HID_USAGE_KEY_*`), Linux `input-event-codes.h`, xkeyboard-config
 * `keycodes/evdev`, Winuser.h virtual-key codes.
 */

export interface HostKeyId {
  /** Canonical ZMK token (`A`, `N1`, `GRAVE`). */
  zmk: string
  /** Other ZMK spellings of the same HID key. `KC_` is accepted by lookup. */
  aliases: readonly string[]
  /** USB HID Keyboard/Keypad usage id (page 0x07). */
  hid: number
  /** XKB symbols name (`AC01`), without angle brackets. */
  xkb: string
  /** Same XKB keycode under another name (`ALGR` = `RALT`). */
  xkbAliases: readonly string[]
  /** Linux evdev `KEY_*` value. The XKB numeric keycode is this plus 8. */
  evdev: number
  evdevName: string
  /** Windows virtual-key name, as MSKLC spells it. */
  vk: string
  vkCode: number
}

interface HostKeySeed {
  zmk: string
  aliases?: readonly string[]
  hid: number
  xkb: string
  xkbAliases?: readonly string[]
  evdev: number
  evdevName: string
  vk: string
  vkCode: number
}

function letters(chars: string, xkbPrefix: string, evdevStart: number): HostKeySeed[] {
  return [...chars].map((ch, index) => {
    const offset = ch.charCodeAt(0) - 65
    return {
      zmk: ch,
      hid: 0x04 + offset,
      xkb: `${xkbPrefix}${String(index + 1).padStart(2, '0')}`,
      xkbAliases: [`LAT${ch}`],
      evdev: evdevStart + index,
      evdevName: `KEY_${ch}`,
      vk: `VK_${ch}`,
      vkCode: 0x41 + offset
    }
  })
}

function digits(): HostKeySeed[] {
  return [...'1234567890'].map((label, index) => ({
    zmk: `N${label}`,
    aliases: [`NUMBER_${label}`],
    hid: 0x1e + index,
    xkb: `AE${String(index + 1).padStart(2, '0')}`,
    evdev: 2 + index,
    evdevName: `KEY_${label}`,
    vk: `VK_${label}`,
    vkCode: label.charCodeAt(0)
  }))
}

const SEEDS: readonly HostKeySeed[] = [
  ...digits(),
  {
    zmk: 'GRAVE',
    hid: 0x35,
    xkb: 'TLDE',
    evdev: 41,
    evdevName: 'KEY_GRAVE',
    vk: 'VK_OEM_3',
    vkCode: 0xc0
  },
  ...letters('QWERTYUIOP', 'AD', 16),
  {
    zmk: 'LBKT',
    aliases: ['LEFT_BRACKET'],
    hid: 0x2f,
    xkb: 'AD11',
    evdev: 26,
    evdevName: 'KEY_LEFTBRACE',
    vk: 'VK_OEM_4',
    vkCode: 0xdb
  },
  {
    zmk: 'RBKT',
    aliases: ['RIGHT_BRACKET'],
    hid: 0x30,
    xkb: 'AD12',
    evdev: 27,
    evdevName: 'KEY_RIGHTBRACE',
    vk: 'VK_OEM_6',
    vkCode: 0xdd
  },
  ...letters('ASDFGHJKL', 'AC', 30),
  {
    zmk: 'SEMI',
    aliases: ['SEMICOLON', 'SCLN'],
    hid: 0x33,
    xkb: 'AC10',
    evdev: 39,
    evdevName: 'KEY_SEMICOLON',
    vk: 'VK_OEM_1',
    vkCode: 0xba
  },
  {
    zmk: 'SQT',
    aliases: ['SINGLE_QUOTE', 'APOSTROPHE', 'APOS', 'QUOT'],
    hid: 0x34,
    xkb: 'AC11',
    evdev: 40,
    evdevName: 'KEY_APOSTROPHE',
    vk: 'VK_OEM_7',
    vkCode: 0xde
  },
  {
    zmk: 'BSLH',
    aliases: ['BACKSLASH'],
    hid: 0x31,
    xkb: 'BKSL',
    xkbAliases: ['AC12'],
    evdev: 43,
    evdevName: 'KEY_BACKSLASH',
    vk: 'VK_OEM_5',
    vkCode: 0xdc
  },
  ...letters('ZXCVBNM', 'AB', 44),
  {
    zmk: 'COMMA',
    hid: 0x36,
    xkb: 'AB08',
    evdev: 51,
    evdevName: 'KEY_COMMA',
    vk: 'VK_OEM_COMMA',
    vkCode: 0xbc
  },
  {
    zmk: 'DOT',
    aliases: ['PERIOD'],
    hid: 0x37,
    xkb: 'AB09',
    evdev: 52,
    evdevName: 'KEY_DOT',
    vk: 'VK_OEM_PERIOD',
    vkCode: 0xbe
  },
  {
    zmk: 'SLASH',
    aliases: ['FSLH'],
    hid: 0x38,
    xkb: 'AB10',
    evdev: 53,
    evdevName: 'KEY_SLASH',
    vk: 'VK_OEM_2',
    vkCode: 0xbf
  },
  {
    zmk: 'NON_US_BSLH',
    aliases: ['NON_US_BACKSLASH', 'NUBS'],
    hid: 0x64,
    xkb: 'LSGT',
    evdev: 86,
    evdevName: 'KEY_102ND',
    vk: 'VK_OEM_102',
    vkCode: 0xe2
  },
  {
    zmk: 'MINUS',
    hid: 0x2d,
    xkb: 'AE11',
    evdev: 12,
    evdevName: 'KEY_MINUS',
    vk: 'VK_OEM_MINUS',
    vkCode: 0xbd
  },
  {
    zmk: 'EQUAL',
    hid: 0x2e,
    xkb: 'AE12',
    evdev: 13,
    evdevName: 'KEY_EQUAL',
    vk: 'VK_OEM_PLUS',
    vkCode: 0xbb
  },
  {
    zmk: 'CAPS',
    aliases: ['CAPSLOCK', 'CLCK'],
    hid: 0x39,
    xkb: 'CAPS',
    evdev: 58,
    evdevName: 'KEY_CAPSLOCK',
    vk: 'VK_CAPITAL',
    vkCode: 0x14
  },
  {
    zmk: 'LSHIFT',
    aliases: ['LEFT_SHIFT', 'LSHFT', 'LSFT'],
    hid: 0xe1,
    xkb: 'LFSH',
    evdev: 42,
    evdevName: 'KEY_LEFTSHIFT',
    vk: 'VK_LSHIFT',
    vkCode: 0xa0
  },
  {
    zmk: 'RSHIFT',
    aliases: ['RIGHT_SHIFT', 'RSHFT', 'RSFT'],
    hid: 0xe5,
    xkb: 'RTSH',
    evdev: 54,
    evdevName: 'KEY_RIGHTSHIFT',
    vk: 'VK_RSHIFT',
    vkCode: 0xa1
  },
  {
    zmk: 'RALT',
    aliases: ['RIGHT_ALT'],
    hid: 0xe6,
    xkb: 'RALT',
    xkbAliases: ['ALGR'],
    evdev: 100,
    evdevName: 'KEY_RIGHTALT',
    vk: 'VK_RMENU',
    vkCode: 0xa5
  },
  {
    zmk: 'RWIN',
    aliases: ['RIGHT_GUI', 'RGUI', 'RIGHT_WIN', 'RIGHT_COMMAND', 'RCMD', 'RIGHT_META', 'RMETA'],
    hid: 0xe7,
    xkb: 'RWIN',
    evdev: 126,
    evdevName: 'KEY_RIGHTMETA',
    vk: 'VK_RWIN',
    vkCode: 0x5c
  }
]

function freeze(seed: HostKeySeed): HostKeyId {
  return Object.freeze({
    zmk: seed.zmk,
    aliases: Object.freeze([...(seed.aliases ?? [])]),
    hid: seed.hid,
    xkb: seed.xkb,
    xkbAliases: Object.freeze([...(seed.xkbAliases ?? [])]),
    evdev: seed.evdev,
    evdevName: seed.evdevName,
    vk: seed.vk,
    vkCode: seed.vkCode
  })
}

function claim<T>(map: Map<string, T>, token: string, value: T, kind: string): void {
  const prev = map.get(token)
  if (prev && prev !== value) {
    throw new Error(`host key id: ${kind} ${token} names two keys`)
  }
  map.set(token, value)
}

function buildIndexes(keys: readonly HostKeyId[]): {
  byZmk: Map<string, HostKeyId>
  byXkb: Map<string, HostKeyId>
  byHid: Map<number, HostKeyId>
  byVk: Map<string, HostKeyId>
} {
  const byZmk = new Map<string, HostKeyId>()
  const byXkb = new Map<string, HostKeyId>()
  const byHid = new Map<number, HostKeyId>()
  const byVk = new Map<string, HostKeyId>()
  for (const key of keys) {
    for (const name of [key.zmk, ...key.aliases]) claim(byZmk, name, key, 'ZMK')
    for (const name of [key.xkb, ...key.xkbAliases]) claim(byXkb, name, key, 'XKB')
    const prevHid = byHid.get(key.hid)
    if (prevHid) throw new Error(`host key id: HID ${key.hid} names two keys`)
    byHid.set(key.hid, key)
    claim(byVk, key.vk, key, 'VK')
  }
  return { byZmk, byXkb, byHid, byVk }
}

export const HOST_KEY_IDS: readonly HostKeyId[] = Object.freeze(SEEDS.map(freeze))

const INDEX = buildIndexes(HOST_KEY_IDS)

function normalizeName(raw: string): string {
  return raw.trim().replace(/^<|>$/g, '').toUpperCase()
}

/** ZMK token (`A`, `KC_A`, `SEMI`) → the same host key, or undefined. */
export function hostKeyByZmk(token: string): HostKeyId | undefined {
  const name = normalizeName(token)
  return INDEX.byZmk.get(name) ?? (name.startsWith('KC_') ? INDEX.byZmk.get(name.slice(3)) : undefined)
}

/** XKB name (`AC01` or `<AC01>`) → the same host key, or undefined. */
export function hostKeyByXkb(name: string): HostKeyId | undefined {
  return INDEX.byXkb.get(normalizeName(name))
}

/** HID Keyboard/Keypad usage id → the same host key, or undefined. */
export function hostKeyByHid(usage: number): HostKeyId | undefined {
  return INDEX.byHid.get(usage)
}

/** Windows virtual-key name (`VK_A`) → the same host key, or undefined. */
export function hostKeyByVk(name: string): HostKeyId | undefined {
  return INDEX.byVk.get(normalizeName(name))
}
