import { describe, expect, it } from 'vitest'
import { isCompactHoldTap, isComplex, isSimple, type HydratedNode } from './hydrate'

function node(
  symbol: string,
  extras: Partial<HydratedNode> = {}
): HydratedNode {
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

  it('keeps compact modifier chords simple', () => {
    expect(
      isSimple({
        value: '&kp',
        params: [
          node('⌃', {
            value: 'LC',
            source: { code: 'LC', symbol: '⌃' },
            params: [node('⌦', { value: 'DEL', source: { code: 'DEL', symbol: '⌦' } })]
          })
        ]
      })
    ).toBe(true)
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
