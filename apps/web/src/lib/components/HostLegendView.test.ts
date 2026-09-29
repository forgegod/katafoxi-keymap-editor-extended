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
  })

  it('shows mark hints under the differences button once a second language is open', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    editor.symbolAlignOn = true
    mountView()

    const highlight = button('Highlight symbol differences')
    expect(highlight.disabled).toBe(false)
    expect(highlight.title).toBe('Highlight symbol differences')
    expect(target.querySelector('.moved')?.getAttribute('title')).toBe(
      'A symbol that sits on a different key.'
    )
    expect(target.querySelector('.win')?.getAttribute('title')).toBe(
      'Windows keeps AltGr or AltGr+Shift from the other language and drops this one.'
    )
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
})
