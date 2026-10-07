import { describe, expect, it } from 'vitest'
import { hostKeyByHid, hostKeyByVk, hostKeyByXkb, hostKeyByZmk, HOST_KEY_IDS } from './host-key-id.js'

/**
 * `key <NAME>` tokens in the LARK host symbols (English `au` basic and
 * Russian `ru` legacy). Each one is a single HID key.
 */
const LARK_SYMBOL_KEYS = [
  'TLDE',
  'AE01',
  'AE02',
  'AE03',
  'AE04',
  'AE05',
  'AE06',
  'AE07',
  'AE08',
  'AE09',
  'AE10',
  'AE11',
  'AE12',
  'AD01',
  'AD02',
  'AD03',
  'AD04',
  'AD05',
  'AD06',
  'AD07',
  'AD08',
  'AD09',
  'AD10',
  'AD11',
  'AD12',
  'AC01',
  'AC02',
  'AC03',
  'AC04',
  'AC05',
  'AC06',
  'AC07',
  'AC08',
  'AC09',
  'AC10',
  'AC11',
  'AB01',
  'AB02',
  'AB03',
  'AB04',
  'AB05',
  'AB06',
  'AB07',
  'AB08',
  'AB09',
  'AB10',
  'BKSL',
  'RWIN',
  'RALT'
] as const

describe('host key ids', () => {
  it('maps each LARK symbols key to one ZMK token', () => {
    const zmk = LARK_SYMBOL_KEYS.map(name => {
      const key = hostKeyByXkb(name)
      expect(key, name).toBeDefined()
      return key!.zmk
    })
    expect(new Set(zmk).size).toBe(LARK_SYMBOL_KEYS.length)
  })

  it('joins ZMK, HID, XKB, evdev, and VK for the A key', () => {
    const key = hostKeyByZmk('A')
    expect(key).toMatchObject({
      zmk: 'A',
      hid: 0x04,
      xkb: 'AC01',
      evdev: 30,
      evdevName: 'KEY_A',
      vk: 'VK_A',
      vkCode: 0x41,
      scan: 0x1e
    })
    expect(key!.evdev + 8).toBe(38)
    expect(hostKeyByZmk('KC_A')).toBe(key)
    expect(hostKeyByXkb('<AC01>')).toBe(key)
    expect(hostKeyByHid(0x04)).toBe(key)
    expect(hostKeyByVk('vk_a')).toBe(key)
  })

  it('uses the short ZMK names from the LARK keymap', () => {
    expect(hostKeyByZmk('N1')).toMatchObject({ xkb: 'AE01', hid: 0x1e, vk: 'VK_1' })
    expect(hostKeyByZmk('GRAVE')).toMatchObject({ xkb: 'TLDE', vk: 'VK_OEM_3' })
    expect(hostKeyByZmk('LBKT')).toMatchObject({ xkb: 'AD11' })
    expect(hostKeyByZmk('SEMI')).toMatchObject({ xkb: 'AC10' })
    expect(hostKeyByZmk('SQT')).toMatchObject({ xkb: 'AC11' })
    expect(hostKeyByZmk('BSLH')).toMatchObject({ xkb: 'BKSL' })
    expect(hostKeyByZmk('SLASH')).toMatchObject({ xkb: 'AB10' })
    expect(hostKeyByZmk('FSLH')).toBe(hostKeyByZmk('SLASH'))
    expect(hostKeyByXkb('AC12')).toBe(hostKeyByXkb('BKSL'))
    expect(hostKeyByXkb('ALGR')).toBe(hostKeyByZmk('RALT'))
    expect(hostKeyByXkb('LatQ')).toBe(hostKeyByXkb('AD01'))
    expect(hostKeyByXkb('LatA')).toBe(hostKeyByXkb('AC01'))
  })

  it('keeps level selectors on their own rows', () => {
    expect(hostKeyByXkb('CAPS')?.zmk).toBe('CAPS')
    expect(hostKeyByXkb('LFSH')).toMatchObject({ zmk: 'LSHIFT', hid: 0xe1, vk: 'VK_LSHIFT' })
    expect(hostKeyByXkb('RTSH')?.zmk).toBe('RSHIFT')
    expect(hostKeyByZmk('LSFT')).toBe(hostKeyByZmk('LSHIFT'))
    expect(hostKeyByXkb('LSGT')).toMatchObject({
      zmk: 'NON_US_BSLH',
      hid: 0x64,
      evdev: 86,
      evdevName: 'KEY_102ND',
      vk: 'VK_OEM_102'
    })
    expect(hostKeyByZmk('NUBS')).toBe(hostKeyByXkb('LSGT'))
  })

  it('does not treat a shifted alias as its own HID key', () => {
    for (const token of ['COLON', 'EXCL', 'AT', 'PIPE', 'TILDE', 'QMARK', 'PLUS', 'KC_COLON']) {
      expect(hostKeyByZmk(token), token).toBeUndefined()
    }
  })

  it('gives every row a unique hid, xkb name, evdev code, and vk', () => {
    const hids = HOST_KEY_IDS.map(key => key.hid)
    const xkbs = HOST_KEY_IDS.map(key => key.xkb)
    const evdevs = HOST_KEY_IDS.map(key => key.evdev)
    const vks = HOST_KEY_IDS.map(key => key.vk)
    expect(new Set(hids).size).toBe(HOST_KEY_IDS.length)
    expect(new Set(xkbs).size).toBe(HOST_KEY_IDS.length)
    expect(new Set(evdevs).size).toBe(HOST_KEY_IDS.length)
    expect(new Set(vks).size).toBe(HOST_KEY_IDS.length)
    expect(HOST_KEY_IDS).toHaveLength(53)
  })
})
