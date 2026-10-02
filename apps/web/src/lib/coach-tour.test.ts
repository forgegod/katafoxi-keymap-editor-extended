import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  COACH_TOUR_STEPS,
  COACH_TOUR_STORAGE_KEY,
  readCoachTourDone,
  writeCoachTourDone
} from './coach-tour'

describe('coach-tour', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('lists click, Alt+click, legend, eyes, and bring-own steps', () => {
    const ids = COACH_TOUR_STEPS.map(step => step.id)
    expect(ids).toEqual([
      'click-key',
      'alt-click',
      'legend',
      'layer-eye',
      'language-eye',
      'bring-own'
    ])
    expect(COACH_TOUR_STEPS.filter(step => step.expandLegend).map(s => s.id)).toEqual([
      'legend',
      'layer-eye',
      'language-eye'
    ])
    expect(COACH_TOUR_STEPS.at(-1)?.finish).toBe(true)
  })

  it('persists done flag in localStorage', () => {
    expect(readCoachTourDone()).toBe(false)
    writeCoachTourDone()
    expect(localStorage.getItem(COACH_TOUR_STORAGE_KEY)).toBe('1')
    expect(readCoachTourDone()).toBe(true)
  })
})
