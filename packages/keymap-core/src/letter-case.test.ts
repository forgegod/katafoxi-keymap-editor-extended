import { describe, expect, it } from 'vitest'
import { foldLetterKey, isLetterCasePair } from './letter-case.js'

describe('letter case', () => {
  it('pairs Turkish dotted and dotless I', () => {
    expect(isLetterCasePair('i', 'İ', 'tr')).toBe(true)
    expect(isLetterCasePair('ı', 'I', 'tr')).toBe(true)
    expect(isLetterCasePair('i', 'I', 'tr')).toBe(false)
    expect(isLetterCasePair('ı', 'İ', 'tr')).toBe(false)
    expect(isLetterCasePair('i', 'I', 'en')).toBe(true)
    expect(isLetterCasePair('ı', 'I', 'en')).toBe(false)
  })

  it('pairs German sharp s without expanding to SS', () => {
    expect(isLetterCasePair('ß', 'ẞ', 'de')).toBe(true)
    expect(isLetterCasePair('ß', 'SS', 'de')).toBe(false)
    expect(isLetterCasePair('ß', 'ẞ', 'en')).toBe(true)
  })

  it('folds Turkish and German letters for presence checks', () => {
    expect(foldLetterKey('İ', 'tr')).toBe('i')
    expect(foldLetterKey('I', 'tr')).toBe('ı')
    expect(foldLetterKey('i', 'tr')).toBe('i')
    expect(foldLetterKey('ẞ', 'de')).toBe('ß')
    expect(foldLetterKey('I', 'en')).toBe('i')
  })
})
