import { addHostLanguage, toggleHostLanguage } from '@keymap-editor/keymap-core'
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

  it('shows position, basic, and Win AltGr samples once highlighting is on', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    editor.symbolAlignOn = true
    mountKey()

    const samples = [...target.querySelectorAll('.sample')]
    expect(samples).toHaveLength(3)
    expect(samples[0]?.getAttribute('title')).toMatch(/non-basic mark/)
    expect(samples[0]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('position')
    expect(samples[0]?.querySelector('.swatch.moved')).toBeTruthy()
    expect(samples[1]?.getAttribute('title')).toMatch(/Linux split/)
    expect(samples[1]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('basic')
    expect(samples[1]?.querySelector('.swatch.basic')).toBeTruthy()
    expect(samples[2]?.getAttribute('title')).toBe(
      'Windows keeps AltGr or AltGr+Shift from the other language and drops this one.'
    )
    expect(samples[2]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Win AltGr')
    expect(samples[2]?.querySelector('.swatch.win')).toBeTruthy()
  })

  it('hides Win AltGr when the keycap pair is two national languages', () => {
    let legend = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'fr')
    legend = toggleHostLanguage(legend, 'en')
    legend = toggleHostLanguage(legend, 'ru')
    editor.hostLegend = legend
    editor.symbolAlignOn = true
    mountKey()

    const samples = [...target.querySelectorAll('.sample')]
    expect(samples).toHaveLength(2)
    expect(samples[0]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('position')
    expect(samples[1]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('basic')
    expect(target.querySelector('.swatch.win')).toBeNull()
  })
})
