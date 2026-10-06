import {
  ALT_GR_COLUMN_LABEL,
  ALT_GR_SHIFT_COLUMN_LABEL,
  ALT_LEVEL_EMPTY,
  type LegendDecodeColumn
} from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import DecodeLevelGrid from './DecodeLevelGrid.svelte'

const happyComment = document.createComment('')
const CommentCtor = Object.getPrototypeOf(happyComment).constructor
if (!(happyComment instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', {
    configurable: true,
    writable: true,
    value: CommentCtor
  })
}

function slot(
  text: string,
  extras: Partial<LegendDecodeColumn['slots'][number]> = {}
): LegendDecodeColumn['slots'][number] {
  return { text, differs: false, dead: false, ...extras }
}

const ru: LegendDecodeColumn = {
  language: 'ru',
  flag: '🇷🇺',
  slots: [
    slot('ф'),
    slot('Ф'),
    slot('´', { dead: true }),
    slot(ALT_LEVEL_EMPTY, { differs: true })
  ]
}

describe('DecodeLevelGrid', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
  })

  it('exposes a table without nested rowgroups and names levels in English', () => {
    view = mount(DecodeLevelGrid, {
      target,
      props: {
        current: [ru],
        system: [ru],
        hostSession: true,
        showRevertRow: true,
        zmk: 'A'
      }
    })
    flushSync()

    const table = target.querySelector('[role="table"]')
    expect(table?.getAttribute('aria-label')).toBe('Host levels')
    expect(target.querySelectorAll('[role="rowgroup"]').length).toBe(0)
    expect(
      [...target.querySelectorAll('.lang')].every(el => el.getAttribute('role') === 'none')
    ).toBe(true)
    expect(target.querySelector('.lang-head')?.getAttribute('aria-colspan')).toBe('4')

    const labels = [...target.querySelectorAll('button.slot, button.revert')].map(el =>
      el.getAttribute('aria-label')
    )
    expect(labels).toContain('Edit Russian tap')
    expect(labels).toContain('Edit Russian ⇧')
    expect(labels).toContain(`Edit Russian ${ALT_GR_COLUMN_LABEL} dead key ´`)
    expect(labels).toContain(`Edit Russian ${ALT_GR_SHIFT_COLUMN_LABEL}`)
    expect(labels).toContain(`Revert Russian ${ALT_GR_SHIFT_COLUMN_LABEL}`)
    expect(labels.some(label => label?.includes('level '))).toBe(false)
  })
})
