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
    expect(stack.querySelector('.view-label')?.textContent).toBe('Stack languages')
    expect(highlight.querySelector('.view-label')?.textContent).toBe('Symbol differences')
  })

  it('labels both modes and leaves the difference key off this column', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    editor.symbolAlignOn = true
    mountView()

    const highlight = button('Highlight symbol differences')
    expect(highlight.disabled).toBe(false)
    expect(highlight.title).toBe('Highlight symbol differences')
    expect(highlight.querySelector('.view-label')?.textContent).toBe('Symbol differences')
    expect(target.querySelector('.moved')).toBeNull()
    expect(target.querySelector('.win')).toBeNull()
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

  it('shows a quiet empty-row control beside symbol differences when the top row is blank', () => {
    editor.layout = [
      { x: 0, y: 0, row: 0 },
      { x: 1, y: 0, row: 0 },
      { x: 0, y: 1, row: 1 }
    ]
    editor.draftKeymap = {
      layers: [
        [
          { value: '&none', params: [] },
          { value: '&none', params: [] },
          { value: '&kp', params: [{ value: 'A', params: [] }] }
        ]
      ]
    }
    mountView()

    const modes = [...target.querySelectorAll('.view-toggle')]
    const empty = target.querySelector('.empty-row')
    if (!(empty instanceof HTMLButtonElement)) throw new Error('missing empty row')
    expect(modes.map(el => el.getAttribute('aria-label'))).toEqual([
      'Stack languages',
      'Highlight symbol differences',
      'Layer colors'
    ])
    expect(modes[2]?.nextElementSibling).toBe(empty)
    expect(empty.getAttribute('aria-label')).toBe('Show empty row')
    expect(empty.textContent).toBe('Show empty row')
    expect(empty.getAttribute('aria-expanded')).toBe('false')
    expect(empty.classList.contains('view-toggle')).toBe(false)

    empty.click()
    flushSync()
    expect(editor.revealEmptyRow).toBe(true)
    expect(empty.getAttribute('aria-label')).toBe('Hide empty row')
    expect(empty.textContent).toBe('Hide empty row')
    expect(empty.getAttribute('aria-expanded')).toBe('true')
  })

  it('hides the empty-row control when the top row has a binding', () => {
    editor.layout = [
      { x: 0, y: 0, row: 0 },
      { x: 0, y: 1, row: 1 }
    ]
    editor.draftKeymap = {
      layers: [
        [
          { value: '&kp', params: [{ value: 'ESC', params: [] }] },
          { value: '&none', params: [] }
        ]
      ]
    }
    mountView()
    expect(target.querySelector('.empty-row')).toBeNull()
  })
})
