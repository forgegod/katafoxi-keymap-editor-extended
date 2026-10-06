/** Line endings used when splicing or formatting DTS keymap text. */
export type LineEnding = '\n' | '\r\n'

/**
 * Pick the dominant newline from `source`. CRLF wins when it outnumbers bare
 * LF; a tie (or no newlines) prefers LF.
 */
export function dominantEol(source: string): LineEnding {
  let crlf = 0
  let lf = 0
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '\n') continue
    if (i > 0 && source[i - 1] === '\r') crlf++
    else lf++
  }
  return crlf > lf ? '\r\n' : '\n'
}

/** Move `from` back over a preceding LF or CRLF. */
export function eatPrecedingEol(source: string, from: number): number {
  if (from > 0 && source[from - 1] === '\n') {
    from--
    if (from > 0 && source[from - 1] === '\r') from--
  }
  return from
}

/** Advance `end` past a following LF or CRLF. */
export function eatFollowingEol(source: string, end: number): number {
  if (source[end] === '\r' && source[end + 1] === '\n') return end + 2
  if (source[end] === '\n') return end + 1
  return end
}

/** Collapse runs of 3+ blank lines down to a double blank line. */
export function collapseExtraBlankLines(text: string, eol: LineEnding): string {
  if (eol === '\r\n') return text.replace(/(?:\r\n){3,}/g, '\r\n\r\n')
  return text.replace(/\n{3,}/g, '\n\n')
}

/**
 * Join `before` + `after` and collapse a 3+ newline run only at the join.
 * Distant extra blanks in either side stay byte-identical.
 */
export function joinCollapsingExtraBlankLines(
  before: string,
  after: string,
  eol: LineEnding
): string {
  const text = before + after
  const n = eol.length
  let start = before.length
  let end = before.length
  while (start >= n && text.slice(start - n, start) === eol) start -= n
  while (end + n <= text.length && text.slice(end, end + n) === eol) end += n
  const count = (end - start) / n
  if (count < 3) return text
  return text.slice(0, start) + eol + eol + text.slice(end)
}
