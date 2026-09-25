import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { hostLayoutsForLanguage } from './host-layout-registry.js'
import { hostLayoutMeta } from './host-layout-registry.js'
import {
  addHostLanguage,
  assignHostLanguageLayout,
  removeHostLanguage,
  replaceHostLanguage,
  setHostColumnAlt,
  standardHostLegendView,
  toggleHostLanguage
} from './host-legend-view.js'
import {
  ADDABLE_HOST_LANGUAGE_IDS,
  HOST_LANGUAGE_IDS,
  type HostLanguageId
} from './host-languages.js'
import type { HostLegendView } from './types.js'

type Transition =
  | { kind: 'add'; language: HostLanguageId }
  | { kind: 'remove'; language: HostLanguageId }
  | { kind: 'replace'; from: HostLanguageId; to: HostLanguageId }
  | { kind: 'toggle'; language: HostLanguageId }
  | { kind: 'alt'; language: HostLanguageId; field: 'altGr' | 'altGrShift'; on: boolean }
  | { kind: 'assign'; language: HostLanguageId; layoutId: string }

function applyTransition(view: HostLegendView, step: Transition): HostLegendView {
  switch (step.kind) {
    case 'add':
      return addHostLanguage(view, step.language)
    case 'remove':
      return removeHostLanguage(view, step.language)
    case 'replace':
      return replaceHostLanguage(view, step.from, step.to)
    case 'toggle':
      return toggleHostLanguage(view, step.language)
    case 'alt':
      return setHostColumnAlt(view, step.language, step.field, step.on)
    case 'assign':
      return assignHostLanguageLayout(view, step.language, step.layoutId)
  }
}

function assertViewInvariants(view: HostLegendView) {
  expect(view.columns.length).toBeGreaterThanOrEqual(1)
  const languages = view.columns.map(column => column.language)
  expect(new Set(languages).size).toBe(languages.length)
  const extras = view.columns.slice(1)
  if (view.open == null) {
    expect(extras.every(column => column.language !== view.open)).toBe(true)
  } else {
    expect(extras.some(column => column.language === view.open)).toBe(true)
    expect(view.columns[0].language).not.toBe(view.open)
  }
  for (const column of view.columns) {
    expect(hostLayoutMeta(column.layoutId)?.language).toBe(column.language)
  }
}

const languageArb = fc.constantFrom(...HOST_LANGUAGE_IDS)
const addableArb = fc.constantFrom(...ADDABLE_HOST_LANGUAGE_IDS)
const layoutAssignArb = fc.constantFrom(...HOST_LANGUAGE_IDS).chain(language => {
  const ids = hostLayoutsForLanguage(language).map(choice => choice.id)
  return fc.constantFrom(...ids).map(layoutId => ({ language, layoutId }))
})

const transitionArb: fc.Arbitrary<Transition> = fc.oneof(
  addableArb.map(language => ({ kind: 'add' as const, language })),
  addableArb.map(language => ({ kind: 'remove' as const, language })),
  fc.record({ from: addableArb, to: addableArb }).map(({ from, to }) => ({
    kind: 'replace' as const,
    from,
    to
  })),
  languageArb.map(language => ({ kind: 'toggle' as const, language })),
  fc
    .record({
      language: languageArb,
      field: fc.constantFrom('altGr' as const, 'altGrShift' as const),
      on: fc.boolean()
    })
    .map(step => ({ kind: 'alt' as const, ...step })),
  layoutAssignArb.map(({ language, layoutId }) => ({
    kind: 'assign' as const,
    language,
    layoutId
  }))
)

describe('host legend view transitions', () => {
  it('keeps one base column, unique languages, and a valid open after any sequence', () => {
    fc.assert(
      fc.property(fc.array(transitionArb, { minLength: 0, maxLength: 12 }), steps => {
        let view = standardHostLegendView()
        for (const step of steps) view = applyTransition(view, step)
        assertViewInvariants(view)
      }),
      { numRuns: 80 }
    )
  })
})
