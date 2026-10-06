import { describe, expect, it } from 'vitest'
import { dominantEol, joinCollapsingExtraBlankLines } from './eol.js'

describe('dominantEol', () => {
  it('returns LF when the source has no newlines or only LF', () => {
    expect(dominantEol('')).toBe('\n')
    expect(dominantEol('alone')).toBe('\n')
    expect(dominantEol('a\nb\nc\n')).toBe('\n')
  })

  it('returns CRLF when CRLF lines outnumber bare LF', () => {
    expect(dominantEol('a\r\nb\r\nc\r\n')).toBe('\r\n')
    expect(dominantEol('a\r\nb\r\nc\n')).toBe('\r\n')
  })

  it('prefers LF on a tie', () => {
    expect(dominantEol('a\r\nb\n')).toBe('\n')
  })
})

describe('joinCollapsingExtraBlankLines', () => {
  it('collapses a 3+ newline run only at the join', () => {
    expect(joinCollapsingExtraBlankLines('a\n\n', '\n\nb', '\n')).toBe('a\n\nb')
    expect(joinCollapsingExtraBlankLines('a\r\n\r\n', '\r\n\r\nb', '\r\n')).toBe(
      'a\r\n\r\nb'
    )
  })

  it('leaves distant extra blanks on either side', () => {
    const before = 'keep\n\n\n\nstill'
    const after = '\ncut\n\n\n\nend'
    expect(joinCollapsingExtraBlankLines(before, after, '\n')).toBe(
      'keep\n\n\n\nstill\ncut\n\n\n\nend'
    )
  })
})
