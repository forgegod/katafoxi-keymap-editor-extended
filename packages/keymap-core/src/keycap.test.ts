import { describe, expect, it } from 'vitest'
import { isCompactHoldTap, isComplex, isSimple, type KeycapNode } from './keycap.js'

function node(
  symbol: string,
  extras: Partial<KeycapNode> = {}
): KeycapNode {
  return {
    value: extras.value ?? 1,
    source: extras.source ?? { symbol, code: extras.value ?? 1 },
    params: extras.params ?? []
  }
}

describe('isSimple', () => {
  it('treats a single-character keycode as simple', () => {
    expect(
      isSimple({
        value: '&kp',
        params: [node('1')]
      })
    ).toBe(true)
  })

  it('keeps compact layer legends simple so &mo L1 stays large', () => {
    expect(
      isSimple({
        value: '&mo',
        params: [node('L1')]
      })
    ).toBe(true)
  })

  it('keeps a compact chord at normal size', () => {
    const chord = {
      value: '&kp',
      params: [
        node('⌥', {
          value: 'LA',
          source: { code: 'LA', symbol: '⌥' },
          params: [node('TAB', { value: 'TAB', source: { code: 'TAB', symbol: 'TAB' } })]
        })
      ]
    }
    expect(isSimple(chord)).toBe(false)
    expect(isComplex(chord, ['code'])).toBe(false)
  })

  it('does not treat longer symbols as simple', () => {
    expect(
      isSimple({
        value: '&kp',
        params: [node('ESC')]
      })
    ).toBe(false)
  })
})

describe('isCompactHoldTap', () => {
  it('recognizes compact &mt hold + tap', () => {
    const mt = {
      value: '&mt',
      params: [
        node('⌃', { value: 'LCTRL', source: { code: 'LCTRL', symbol: '⌃' } }),
        node('J', { value: 'J', source: { code: 'J', symbol: 'J' } })
      ]
    }
    expect(isCompactHoldTap(mt)).toBe(true)
    expect(isComplex(mt, ['mod', 'code'])).toBe(false)
  })

  it('recognizes compact &lt layer + LS(CAPS)', () => {
    const lt = {
      value: '&lt',
      params: [
        node('L1', { value: 1, source: { code: 1, symbol: 'L1' } }),
        node('⇧', {
          value: 'LS',
          source: { code: 'LS', symbol: '⇧' },
          params: [node('⇪', { value: 'CAPS', source: { code: 'CAPS', symbol: '⇪' } })]
        })
      ]
    }
    expect(isCompactHoldTap(lt)).toBe(true)
    expect(isComplex(lt, ['layer', 'code'])).toBe(false)
  })

  it('does not treat a long tap as compact', () => {
    expect(
      isCompactHoldTap({
        value: '&mt',
        params: [
          node('⌃', { value: 'LCTRL', source: { code: 'LCTRL', symbol: '⌃' } }),
          node('ESC', { value: 'ESC', source: { code: 'ESC', symbol: 'ESC' } })
        ]
      })
    ).toBe(false)
  })
})

describe('isComplex', () => {
  it('shrinks long center behaviours', () => {
    expect(isComplex({ value: '&none', params: [] }, [])).toBe(true)
    expect(isComplex({ value: '&trans', params: [] }, [])).toBe(true)
  })

  it('does not shrink a glyph legend such as scroll', () => {
    expect(
      isComplex(
        {
          value: '&msc',
          params: [node('SCRL⬇', { value: 'SCRL_DOWN', source: { code: 'SCRL_DOWN', symbol: 'SCRL⬇' } })]
        },
        ['command']
      )
    ).toBe(false)
  })

  it('shrinks a leftover word longer than four letters', () => {
    expect(
      isComplex(
        {
          value: '&kp',
          params: [node('PG_UP', { value: 'PG_UP', source: { code: 'PG_UP', symbol: 'PG_UP' } })]
        },
        ['code']
      )
    ).toBe(true)
  })

  it('does not shrink compact LC(DEL)', () => {
    expect(
      isComplex(
        {
          value: '&kp',
          params: [
            node('⌃', {
              value: 'LC',
              source: { code: 'LC', symbol: '⌃' },
              params: [node('⌦', { value: 'DEL', source: { code: 'DEL', symbol: '⌦' } })]
            })
          ]
        },
        ['code']
      )
    ).toBe(false)
  })
})
