import { addHostLanguage } from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editor } from '../editor.svelte.js'
import SymbolAlignKey from './SymbolAlignKey.svelte'

describe('SymbolAlignKey', () => {
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

  function mountKey() {
    view = mount(SymbolAlignKey, { target })
    flushSync()
  }

  it('stays hidden until a second language is open and highlighting is on', () => {
    mountKey()
    expect(target.querySelector('.align-key')).toBeNull()

    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    editor.symbolAlignOn = false
    flushSync()
    expect(target.querySelector('.align-key')).toBeNull()
  })

  it('shows position and Win AltGr samples once highlighting is on', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    editor.symbolAlignOn = true
    mountKey()

    const samples = [...target.querySelectorAll('.sample')]
    expect(samples).toHaveLength(2)
    expect(samples[0]?.getAttribute('title')).toBe(
      'No shared key for this symbol, or it is missing from one language.'
    )
    expect(samples[0]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('position')
    expect(samples[0]?.querySelector('.swatch.moved')).toBeTruthy()
    expect(samples[1]?.getAttribute('title')).toBe(
      'Windows keeps AltGr or AltGr+Shift from the other language and drops this one.'
    )
    expect(samples[1]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Win AltGr')
    expect(samples[1]?.querySelector('.swatch.win')).toBeTruthy()
  })
})