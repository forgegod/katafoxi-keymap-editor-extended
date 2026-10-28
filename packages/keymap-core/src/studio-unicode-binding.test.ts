import { describe, expect, it } from 'vitest'
import { expandStudioUnicodeBinding, parseKeyBinding, UNICODE_ALIASES } from './index.js'

describe('Studio Unicode binding expansion', () => {
  it('expands the pinned language alias without changing source tokens', () => {
    const binding = parseKeyBinding('&uc UC_DE_AE')
    const original = structuredClone(binding)

    expect(expandStudioUnicodeBinding(binding)).toEqual({ param1: 0xe4, param2: 0xc4 })
    expect(binding).toEqual(original)
  })

  it('uses every pinned alias pair, including sharp S rather than inferred uppercase', () => {
    expect(expandStudioUnicodeBinding(parseKeyBinding('&uc UC_DE_SS')))
      .toEqual({ param1: 0xdf, param2: 0x1e9e })
    for (const alias of UNICODE_ALIASES) {
      expect(expandStudioUnicodeBinding(parseKeyBinding(`&uc ${alias.code}`)))
        .toEqual({ param1: alias.normal, param2: alias.shift })
    }
  })

  it.each([
    ['UC_SET_MACOS', 0],
    ['UC_SET_LINUX', 1],
    ['UC_SET_LINUX_ALT', 2],
    ['UC_SET_WIN_COMPOSE', 3],
    ['UC_SET_WIN_ALT', 4],
    ['UC_SET_EMACS', 5]
  ])('expands %s to the module sentinel and mode index', (alias, index) => {
    expect(expandStudioUnicodeBinding(parseKeyBinding(`&uc ${alias}`)))
      .toEqual({ param1: 0xffffff, param2: index })
  })

  it.each([
    ['&uc 0xE4 0xC4', 0xe4, 0xc4],
    ['&uc 0xE4 0', 0xe4, 0],
    ['&uc 228 196', 228, 196],
    ['&uc 0 0', 0, 0],
    ['&uc 0xD7FF 0xE000', 0xd7ff, 0xe000],
    ['&uc 0x1F600 0x10FFFF', 0x1f600, 0x10ffff]
  ])('expands explicit scalar cells in %s without inferring Shift', (source, param1, param2) => {
    const binding = parseKeyBinding(source)
    const original = structuredClone(binding)

    expect(expandStudioUnicodeBinding(binding)).toEqual({ param1, param2 })
    expect(binding).toEqual(original)
  })

  it('accepts numeric scalar nodes', () => {
    expect(expandStudioUnicodeBinding({
      value: '&uc', params: [{ value: 0xe4, params: [] }, { value: 0, params: [] }]
    })).toEqual({ param1: 0xe4, param2: 0 })
  })

  it.each([
    '&uc', '&uc 0xE4', '&uc 228', '&uc 0',
    '&uc 0x110000 0', '&uc 0 0x110000',
    '&uc 0xD800 0', '&uc 0xDFFF 0', '&uc 0 0xD800', '&uc 0 0xDFFF',
    '&uc -1 0', '&uc 0 1.5', '&uc 0xffffff 1',
    '&uc UC_UNKNOWN', '&uc UC_SET_UNKNOWN',
    '&uc UC_DE_AE 0', '&uc UC_SET_LINUX 0', '&uc 0xE4 0 0',
    '&uc (0xE4) 0', '&uc LC(0xE4) 0',
    '&uc ä Ä', '&uc U+00E4 U+00C4', '&uc 1e2 0', '&uc 0xE4junk 0',
    '&kp 228 196'
  ])('refuses unsupported or invalid source %s', source => {
    const binding = parseKeyBinding(source)
    const original = structuredClone(binding)
    expect(expandStudioUnicodeBinding(binding)).toBeNull()
    expect(binding).toEqual(original)
  })

  it.each([NaN, Infinity, -1, 1.5, 0xd800, 0xdfff, 0x110000])(
    'refuses invalid numeric scalar %s in either cell', value => {
      for (const values of [[value, 0], [0, value]]) {
        expect(expandStudioUnicodeBinding({
          value: '&uc', params: values.map(value => ({ value, params: [] }))
        })).toBeNull()
      }
    }
  )

  it.each(['UC_DE_AE', 'UC_SET_LINUX'])('refuses a nested %s alias', value => {
    expect(expandStudioUnicodeBinding({
      value: '&uc', params: [{ value, params: [{ value: 0, params: [] }] }]
    })).toBeNull()
  })
})
