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

  it('shows position and Win AltGr once highlighting is on', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    editor.symbolAlignOn = true
    mountKey()

    expect(target.querySelector('.moved')?.getAttribute('title')).toBe(
      'A symbol that sits on a different key.'
    )
    expect(target.querySelector('.win')?.getAttribute('title')).toBe(
      'Windows keeps AltGr or AltGr+Shift from the other language and drops this one.'
    )
  })
})