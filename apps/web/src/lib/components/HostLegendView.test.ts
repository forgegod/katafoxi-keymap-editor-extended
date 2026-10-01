import { addHostLanguage } from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editor } from '../editor.svelte.js'
import HostLegendView from './HostLegendView.svelte'

describe('HostLegendView', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    editor.resetForTests()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target.remove()
    editor.resetForTests()
  })

  function mountView() {
    view = mount(HostLegendView, { target })
    flushSync()
  }

  function button(label: string): HTMLButtonElement {
    const found = target.querySelector(`button[aria-label="${label}"]`)
    if (!(found instanceof HTMLButtonElement)) throw new Error(`missing ${label}`)
    return found
  }

  it('keeps stack pale until a third language and hides the difference marks', () => {
    mountView()

    const stack = button('Stack languages')
    expect(stack.disabled).toBe(true)
    expect(stack.classList.contains('pale')).toBe(true)
    expect(stack.title).toBe('Needs 3 host languages. Two languages already share the key.')

    const highlight = button('Highlight symbol differences')
    expect(highlight.disabled).toBe(true)
    expect(highlight.title).toBe(
      'Highlight symbol differences. Open a second host language first.'
    )
    expect(target.querySelector('.moved')).toBeNull()
    expect(stack.querySelector('.view-label')?.textContent).toBe('Stack')
    expect(highlight.querySelector('.view-label')?.textContent).toBe('Differences')
  })

  it('labels both modes and shows difference samples under the toggle', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    editor.symbolAlignOn = true
    mountView()

    const highlight = button('Highlight symbol differences')
    expect(highlight.disabled).toBe(false)
    expect(highlight.title).toBe('Highlight symbol differences')
    expect(highlight.querySelector('.view-label')?.textContent).toBe('Differences')
    const slot = highlight.nextElementSibling
    expect(slot).toBeInstanceOf(HTMLElement)
    expect(slot?.classList.contains('align-slot')).toBe(true)
    expect(slot?.classList.contains('on')).toBe(true)
    expect(
      target.querySelector('.sample .moved')?.closest('.sample')?.textContent?.replace(/\s+/g, ' ').trim()
    ).toBe('position')
    expect(
      target.querySelector('.sample .win')?.closest('.sample')?.textContent?.replace(/\s+/g, ' ').trim()
    ).toBe('Win AltGr')
    expect(button('Stack languages').disabled).toBe(true)
  })

  it('turns stacking on when a third language is present', () => {
    editor.hostLegend = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'uk')
    mountView()

    const stack = button('Stack languages')
    expect(stack.disabled).toBe(false)
    expect(stack.classList.contains('pale')).toBe(false)
    expect(stack.title).toMatch(/own row on the key/)
    stack.click()
    flushSync()
    expect(editor.multilangView).toBe(true)
    expect(stack.getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles layer color wash off by default and on when pressed', () => {
    mountView()

    const tones = button('Layer colors')
    expect(editor.layerTonesOn).toBe(false)
    expect(tones.getAttribute('aria-pressed')).toBe('false')
    expect(tones.classList.contains('on')).toBe(false)
    expect(tones.title).toMatch(/soft wash/)

    tones.click()
    flushSync()
    expect(editor.layerTonesOn).toBe(true)
    expect(tones.getAttribute('aria-pressed')).toBe('true')
    expect(tones.classList.contains('on')).toBe(true)
  })

  it('shows a scheme toggle beside layer colors', () => {
    mountView()

    const modes = [...target.querySelectorAll('.view-toggle')]
    const scheme = button('Show matrix scheme')
    const board = target.querySelector('.board-row')
    if (!(board instanceof HTMLElement)) throw new Error('missing board row')
    expect(modes.map(el => el.getAttribute('aria-label'))).toEqual([
      'Stack languages',
      'Highlight symbol differences',
      'Layer colors',
      'Show matrix scheme'
    ])
    expect(board.contains(modes[2]!)).toBe(true)
    expect(board.contains(scheme)).toBe(true)
    expect(modes[2]?.nextElementSibling?.classList.contains('scheme-slot')).toBe(true)
    expect(scheme.classList.contains('view-toggle')).toBe(true)
    expect(scheme.classList.contains('half')).toBe(true)
    expect(scheme.classList.contains('on')).toBe(false)
    expect(scheme.getAttribute('aria-pressed')).toBe('false')
    expect(scheme.querySelector('.view-label')?.textContent).toBe('Scheme')

    scheme.click()
    flushSync()
    expect(editor.schemeMode).toBe(true)
    expect(scheme.getAttribute('aria-label')).toBe('Hide matrix scheme')
    expect(scheme.getAttribute('aria-pressed')).toBe('true')
    expect(scheme.classList.contains('on')).toBe(true)
    expect(scheme.querySelector('.view-label')?.textContent).toBe('Scheme')
  })

  it('keeps the scheme slot beside layer colors', () => {
    mountView()
    expect(target.querySelector('.board-row .scheme-slot')).toBeInstanceOf(HTMLElement)
    expect(button('Layer colors').classList.contains('half')).toBe(true)
  })
})
