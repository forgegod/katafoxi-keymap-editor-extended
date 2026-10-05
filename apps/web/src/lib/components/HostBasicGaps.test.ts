import {
  addHostLanguage,
  assignHostLanguageLayout,
  hostLayout,
  parseKeyBinding,
  primarySystemLayoutId,
  registerHostLayout,
  toggleHostLanguage,
  unregisterHostLayout,
  withHostKey,
  type HostLayout
} from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editor } from '../editor.svelte.js'
import HostBasicGaps from './HostBasicGaps.svelte'

const USER_RU = 'user:gap-ru'

function dropGlyphs(layout: HostLayout, glyphs: readonly string[]): HostLayout {
  const drop = new Set(glyphs)
  let next = layout
  for (const [zmk, row] of [...layout.byZmk]) {
    for (let level = 0; level < row.glyphs.length; level++) {
      if (!drop.has(row.glyphs[level] ?? '')) continue
      const updated = withHostKey(next, zmk, level, 'NoSymbol')
      if (updated) next = updated
    }
  }
  return { ...next, id: USER_RU }
}

describe('HostBasicGaps', () => {
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
    unregisterHostLayout(USER_RU)
    editor.resetForTests()
  })

  function mountGaps() {
    view = mount(HostBasicGaps, { target })
    flushSync()
  }

  it('stays hidden while every column is a system layout', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    mountGaps()
    expect(target.querySelector('.host-gaps')).toBeNull()
  })

  it('names a letter missing from a changed layout, including a hidden column', () => {
    const ru = hostLayout(primarySystemLayoutId('ru')!)!
    registerHostLayout(
      { id: USER_RU, language: 'ru', name: 'gap', flag: '🇷🇺', origin: 'user' },
      dropGlyphs(ru, ['ъ', 'Ъ'])
    )
    editor.hostLegend = toggleHostLanguage(
      assignHostLanguageLayout(addHostLanguage(editor.hostLegend, 'ru'), 'ru', USER_RU),
      'ru'
    )
    mountGaps()

    const text = target.querySelector('.host-gaps')?.textContent?.replace(/\s+/g, ' ').trim()
    expect(text).toBe('Missing Russian ъ')
    expect(text).not.toContain('English')
  })

  it('drops a digit the keymap types from the keypad', () => {
    const ru = hostLayout(primarySystemLayoutId('ru')!)!
    registerHostLayout(
      { id: USER_RU, language: 'ru', name: 'gap', flag: '🇷🇺', origin: 'user' },
      dropGlyphs(ru, ['ъ', 'Ъ', '3'])
    )
    editor.hostLegend = assignHostLanguageLayout(
      addHostLanguage(editor.hostLegend, 'ru'),
      'ru',
      USER_RU
    )
    editor.draftKeymap = { layers: [[parseKeyBinding('&kp KP_N3')]] }
    mountGaps()

    const text = target.querySelector('.host-gaps')?.textContent?.replace(/\s+/g, ' ').trim()
    expect(text).toBe('Missing Russian ъ')
  })

  it('drops a letter as soon as the host table gains it back', () => {
    const ru = hostLayout(primarySystemLayoutId('ru')!)!
    registerHostLayout(
      { id: USER_RU, language: 'ru', name: 'gap', flag: '🇷🇺', origin: 'user' },
      dropGlyphs(ru, ['ъ', 'Ъ'])
    )
    editor.hostLegend = assignHostLanguageLayout(
      addHostLanguage(editor.hostLegend, 'ru'),
      'ru',
      USER_RU
    )
    mountGaps()
    expect(target.querySelector('.host-gaps')?.textContent).toContain('ъ')

    registerHostLayout(
      { id: USER_RU, language: 'ru', name: 'gap', flag: '🇷🇺', origin: 'user' },
      { ...ru, id: USER_RU }
    )
    editor.hostLayoutRevision += 1
    flushSync()
    expect(target.querySelector('.host-gaps')).toBeNull()
  })
})
