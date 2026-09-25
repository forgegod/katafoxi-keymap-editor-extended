import { afterEach, describe, expect, it } from 'vitest'
import { composeLegendDecode } from './compose.js'
import { parseKeyBinding } from './keymap.js'
import {
  assignHostLanguageLayout,
  hostLegendColumns,
  hostLegendFor,
  standardHostLegendView,
  toggleHostLanguage
} from './host-legend-view.js'
import {
  hostLayout,
  hostLayoutById,
  hostLayoutChoice,
  hostLayoutMeta,
  registerHostLayout,
  resetHostLayoutRegistry,
  unregisterHostLayout
} from './host-layout-registry.js'
import type { HostLayout } from './host-layout.js'

const USER_RU_ID = 'user-ru-test'

function columnShape(
  view: ReturnType<typeof standardHostLegendView>,
  aliasId?: string
) {
  return hostLegendColumns(view).map(column => ({
    language: column.language,
    layoutId: aliasId && column.layoutId === aliasId ? 'lark-ru' : column.layoutId,
    shown: column.shown,
    wide: column.wide,
    altGr: column.altGr,
    altGrShift: column.altGrShift
  }))
}

function cloneLayout(id: string, source: HostLayout): HostLayout {
  return { id, byZmk: new Map(source.byZmk) }
}

afterEach(() => {
  resetHostLayoutRegistry()
})

describe('host layout registry', () => {
  it('looks up builtins without treating them as registered', () => {
    expect(hostLayoutMeta('lark-ru')).toMatchObject({
      id: 'lark-ru',
      language: 'ru',
      name: 'legacy',
      flag: '🇷🇺',
      origin: 'system'
    })
    expect(hostLayout('lark-ru')?.byZmk.get('A')?.glyphs).toEqual(['ф', 'Ф', '@', 'α'])
    expect(hostLayoutById('lark-ru')).toBe(hostLayout('lark-ru'))
    expect(hostLayoutChoice('lark-ru')?.kind).toBe('in-layout')
    expect(hostLayout('missing-id')).toBeUndefined()
    expect(hostLayoutMeta('missing-id')).toBeUndefined()
  })

  it('replaces a re-registered user id and refuses builtin ids', () => {
    const source = hostLayout('lark-ru')!
    registerHostLayout(
      {
        id: USER_RU_ID,
        language: 'ru',
        name: 'first',
        flag: '🇷🇺',
        origin: 'user'
      },
      cloneLayout(USER_RU_ID, source)
    )
    expect(hostLayoutMeta(USER_RU_ID)?.name).toBe('first')

    const empty: HostLayout = { id: USER_RU_ID, byZmk: new Map() }
    registerHostLayout(
      {
        id: USER_RU_ID,
        language: 'ru',
        name: 'second',
        flag: '🇷🇺',
        origin: 'user'
      },
      empty
    )
    expect(hostLayoutMeta(USER_RU_ID)?.name).toBe('second')
    expect(hostLayout(USER_RU_ID)?.byZmk.size).toBe(0)

    expect(() =>
      registerHostLayout(
        {
          id: 'lark-ru',
          language: 'ru',
          name: 'nope',
          flag: '🇷🇺',
          origin: 'user'
        },
        empty
      )
    ).toThrow(/built-in/)
    expect(hostLayout('lark-ru')?.byZmk.get('A')?.glyphs).toEqual(['ф', 'Ф', '@', 'α'])

    unregisterHostLayout('lark-ru')
    expect(hostLayout('lark-ru')).toBeDefined()
    unregisterHostLayout(USER_RU_ID)
    expect(hostLayout(USER_RU_ID)).toBeUndefined()
    expect(hostLayoutChoice(USER_RU_ID)).toBeUndefined()
  })

  it('lets a registered ru layout drive the same view and decode path as a builtin', () => {
    const source = hostLayout('lark-ru')!
    registerHostLayout(
      {
        id: USER_RU_ID,
        language: 'ru',
        name: 'legacy',
        flag: '🇷🇺',
        origin: 'user'
      },
      cloneLayout(USER_RU_ID, source)
    )

    const started = standardHostLegendView()
    const builtinView = assignHostLanguageLayout(started, 'ru', 'lark-ru')
    const userView = assignHostLanguageLayout(started, 'ru', USER_RU_ID)

    expect(userView.secondId).toBe(USER_RU_ID)
    expect(hostLayoutMeta(userView.secondId ?? '')?.language).toBe('ru')
    expect(hostLegendFor('A', userView)).toEqual(hostLegendFor('A', builtinView))
    expect(hostLegendFor('T', userView)).toEqual(hostLegendFor('T', builtinView))
    expect(columnShape(userView, USER_RU_ID)).toEqual(columnShape(builtinView))

    const hiddenUser = toggleHostLanguage(userView, 'ru')
    const hiddenBuiltin = toggleHostLanguage(builtinView, 'ru')
    expect(hiddenUser.secondVisible).toBe(false)
    expect(hostLegendFor('A', hiddenUser)).toEqual(hostLegendFor('A', hiddenBuiltin))
    expect(columnShape(hiddenUser, USER_RU_ID)).toEqual(columnShape(hiddenBuiltin))

    const reopened = toggleHostLanguage(hiddenUser, 'ru')
    expect(reopened.secondId).toBe(USER_RU_ID)
    expect(reopened.secondVisible).toBe(true)
    expect(hostLegendFor('A', reopened)).toEqual(hostLegendFor('A', builtinView))

    const binding = parseKeyBinding('&kp A')
    expect(composeLegendDecode(binding, userView)).toEqual(
      composeLegendDecode(binding, builtinView)
    )
    expect(hostLayoutChoice(USER_RU_ID)).toMatchObject({
      id: USER_RU_ID,
      language: 'ru',
      flag: '🇷🇺'
    })
  })
})
