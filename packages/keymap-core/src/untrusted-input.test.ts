/**
 * Untrusted repo / clipboard payloads must fail as domain errors, never
 * TypeError or RangeError (those become API 500 and SPA "Something went wrong").
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { parseDtsKeymap } from './dts-keymap.js'
import { InfoValidationError, KeymapValidationError } from './errors.js'
import { hostLayoutFromXkb } from './host-layout-import.js'
import {
  buildHostKeymapSnapshot,
  parseHostKeymapSnapshot
} from './host-keymap-snapshot.js'
import type { HostLayout } from './host-layout.js'
import { parseKlc } from './klc-read.js'
import { parseKeymap, validateKeymapJson } from './keymap.js'
import { validateInfoJson } from './layout.js'
import type { HostLegendView } from './types.js'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures')
const NUM_RUNS = 300
const FC = { numRuns: NUM_RUNS }

const VALID_INFO = {
  layouts: {
    LAYOUT: {
      layout: [
        { x: 0, y: 0, row: 0, col: 0 },
        { x: 1, y: 0, row: 0, col: 1 },
        { x: 2, y: 0, row: 0, col: 2 },
        { x: 3, y: 0, row: 0, col: 3 }
      ]
    }
  }
}

const VALID_KEYMAP = {
  layers: [
    ['&kp A', '&trans', '&mo 1'],
    ['&lt 1 A', '&mt LSHIFT B']
  ],
  layer_names: ['base', 'raise'],
  combos: [
    {
      id: 'combo_esc',
      keyPositions: [0, 1],
      binding: '&kp ESC',
      timeoutMs: 50,
      layers: [0]
    }
  ]
}

const VIEW: HostLegendView = {
  columns: [
    {
      language: 'en',
      layoutId: 'system-us',
      visible: true,
      altGr: true,
      altGrShift: true
    },
    {
      language: 'ru',
      layoutId: 'user:ru-1',
      visible: true,
      altGr: true,
      altGrShift: false
    }
  ],
  open: 'ru',
  keycap: ['en', 'ru']
}

const SAMPLE_LAYOUT: HostLayout = {
  id: 'user:ru-1',
  byZmk: new Map([
    [
      'Q',
      {
        keysyms: ['Cyrillic_shorti', 'Cyrillic_SHORTI', 'NoSymbol', 'NoSymbol'],
        glyphs: ['й', 'Й', '', '']
      }
    ]
  ])
}

const VALID_SNAPSHOT = buildHostKeymapSnapshot(VIEW, [
  {
    id: 'user:ru-1',
    name: 'typewriter',
    language: 'ru',
    origin: { from: 'copy', layoutId: 'system-ru-legacy' },
    layout: SAMPLE_LAYOUT
  }
])

const LARK_KEYMAP = readFileSync(join(FIXTURES, 'lark/lark.keymap'), 'utf8')
const LARK_INFO = JSON.parse(
  readFileSync(join(FIXTURES, 'lark/info.json'), 'utf8')
) as unknown
const XKB_AU = readFileSync(join(FIXTURES, 'lark/host/au'), 'utf8')
const KLC_FIXTURE = `KBD\tX\t"X"
SHIFTSTATE
0
1
LAYOUT
02	1	0	1	!
0a	9	0	9	(
ENDKBD
`

const jsonValueArb = fc.jsonValue({ maxDepth: 4, maxKeys: 8 })
const jsonStringArb = fc.json({ maxDepth: 4, maxKeys: 8 })
const anythingArb = fc.anything({
  maxDepth: 3,
  maxKeys: 6,
  withSet: true,
  withMap: true,
  withDate: true,
  withTypedArray: false,
  withBigInt: false
})
const shortStringArb = fc.string({ maxLength: 120 })

type MutKind = 'drop' | 'wrongType' | 'null' | 'proto'

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function collectPaths(value: unknown, path: string[] = [], out: string[][] = []): string[][] {
  if (path.length <= 6) out.push(path)
  if (!value || typeof value !== 'object' || path.length >= 5) return out
  if (Array.isArray(value)) {
    const n = Math.min(value.length, 4)
    for (let i = 0; i < n; i++) collectPaths(value[i], [...path, String(i)], out)
  } else {
    let n = 0
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectPaths(child, [...path, key], out)
      if (++n >= 6) break
    }
  }
  return out
}

function getAt(root: unknown, path: string[]): unknown {
  let cur: unknown = root
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function setAt(root: unknown, path: string[], next: unknown): unknown {
  if (path.length === 0) return next
  const [head, ...rest] = path
  if (root === null || typeof root !== 'object') return next
  const clone: Record<string, unknown> | unknown[] = Array.isArray(root)
    ? root.slice()
    : { ...(root as Record<string, unknown>) }
  ;(clone as Record<string, unknown>)[head!] = setAt(
    (root as Record<string, unknown>)[head!],
    rest,
    next
  )
  return clone
}

function dropAt(root: unknown, path: string[]): unknown {
  if (path.length === 0) return undefined
  const [head, ...rest] = path
  if (root === null || typeof root !== 'object') return root
  if (rest.length === 0) {
    if (Array.isArray(root)) {
      const copy = root.slice()
      const index = Number(head)
      if (Number.isInteger(index)) copy.splice(index, 1)
      return copy
    }
    const copy = { ...(root as Record<string, unknown>) }
    delete copy[head!]
    return copy
  }
  if (Array.isArray(root)) {
    const copy = root.slice()
    const index = Number(head)
    copy[index] = dropAt(root[index], rest)
    return copy
  }
  const copy = { ...(root as Record<string, unknown>) }
  copy[head!] = dropAt((root as Record<string, unknown>)[head!], rest)
  return copy
}

function wrongTypeFor(value: unknown): unknown {
  if (typeof value === 'string') return 1
  if (typeof value === 'number') return 'x'
  if (typeof value === 'boolean') return 0
  if (Array.isArray(value)) return { not: 'array' }
  if (value && typeof value === 'object') return ['not-object']
  return { unexpected: true }
}

function injectProto(root: unknown, path: string[]): unknown {
  const payload = { polluted: true, x: 'nope' }
  if (path.length === 0) {
    if (root && typeof root === 'object' && !Array.isArray(root)) {
      const copy = { ...(root as Record<string, unknown>) }
      Object.defineProperty(copy, '__proto__', {
        value: payload,
        enumerable: true,
        configurable: true,
        writable: true
      })
      return copy
    }
    return { __proto__: payload }
  }
  const parentPath = path.slice(0, -1)
  const parent = getAt(root, parentPath)
  if (parent && typeof parent === 'object' && !Array.isArray(parent)) {
    const next = { ...(parent as Record<string, unknown>) }
    Object.defineProperty(next, '__proto__', {
      value: payload,
      enumerable: true,
      configurable: true,
      writable: true
    })
    return setAt(root, parentPath, next)
  }
  return setAt(root, path, { __proto__: payload })
}

function mutate(root: unknown, path: string[], kind: MutKind): unknown {
  switch (kind) {
    case 'drop':
      return dropAt(root, path)
    case 'wrongType':
      return setAt(root, path, wrongTypeFor(getAt(root, path)))
    case 'null':
      return setAt(root, path, null)
    case 'proto':
      return injectProto(root, path)
  }
}

function mutationArb(fixture: unknown): fc.Arbitrary<unknown> {
  const paths = collectPaths(jsonClone(fixture)).filter(path => path.length > 0)
  return fc.tuple(
    fc.constantFrom(...paths),
    fc.constantFrom('drop', 'wrongType', 'null', 'proto') as fc.Arbitrary<MutKind>
  ).map(([path, kind]) => mutate(jsonClone(fixture), path, kind))
}

function untrustedArb(fixture: unknown): fc.Arbitrary<unknown> {
  return fc.oneof(
    jsonValueArb,
    jsonStringArb,
    anythingArb,
    mutationArb(fixture),
    fc.constantFrom(
      undefined,
      null,
      '',
      0,
      false,
      [],
      {},
      JSON.parse('{"__proto__":{"polluted":true}}')
    )
  )
}

function truncated(source: string): string[] {
  const cuts = [0, 1, 2, 8, 16, 32, 64, Math.floor(source.length / 2), source.length - 7]
  const out: string[] = []
  for (const n of cuts) {
    if (n >= 0 && n < source.length) out.push(source.slice(0, n))
  }
  out.push(source.slice(-11))
  return out
}

function expectCaught(
  fn: () => void,
  allowed: Array<new (...args: never[]) => Error>
): void {
  try {
    fn()
  } catch (err) {
    expect(err, nativeThrowMessage(err)).not.toBeInstanceOf(TypeError)
    expect(err, nativeThrowMessage(err)).not.toBeInstanceOf(RangeError)
    if (!allowed.some(cls => err instanceof cls)) {
      const name = err instanceof Error ? err.name : typeof err
      const message = err instanceof Error ? err.message : String(err)
      expect.fail(`unexpected ${name}: ${message}`)
    }
  }
}

function nativeThrowMessage(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

describe('validateInfoJson error messages', () => {
  const cases: Array<{ name: string; input: unknown; message: string | RegExp }> = [
    {
      name: 'non-object root',
      input: null,
      message: 'info.json root must be an object'
    },
    {
      name: 'array root',
      input: [],
      message: 'info must define "layouts"'
    },
    {
      name: 'missing layouts',
      input: { id: 'x' },
      message: 'info must define "layouts"'
    },
    {
      name: 'layouts null',
      input: { layouts: null },
      message: 'layouts must be an object'
    },
    {
      name: 'layouts string',
      input: { layouts: 'LAYOUT' },
      message: 'layouts must be an object'
    },
    {
      name: 'empty layouts object',
      input: { layouts: {} },
      message: 'layouts must define at least one layout'
    },
    {
      name: 'named layout is not an object',
      input: { layouts: { LAYOUT: null } },
      message: 'layout LAYOUT must be an object'
    },
    {
      name: 'named layout missing layout array',
      input: { layouts: { LAYOUT: { keys: [] } } },
      message: 'layout LAYOUT must define "layout" array'
    },
    {
      name: 'key at path is not an object',
      input: {
        layouts: {
          LAYOUT: {
            layout: [
              { x: 0, y: 0, row: 0, col: 0 },
              { x: 1, y: 0, row: 0, col: 1 },
              { x: 2, y: 0, row: 0, col: 2 },
              'bad'
            ]
          }
        }
      },
      message: 'Key definition at layouts[LAYOUT].layout[3] must be an object'
    },
    {
      name: 'missing x at path',
      input: {
        layouts: {
          LAYOUT: {
            layout: [
              { x: 0, y: 0, row: 0, col: 0 },
              { x: 1, y: 0, row: 0, col: 1 },
              { x: 2, y: 0, row: 0, col: 2 },
              { y: 0, row: 0, col: 3 }
            ]
          }
        }
      },
      message: 'Key definition at layouts[LAYOUT].layout[3] must include "x" position'
    },
    {
      name: 'missing y at path',
      input: {
        layouts: {
          LAYOUT: {
            layout: [
              { x: 0, y: 0, row: 0, col: 0 },
              { x: 1, y: 0, row: 0, col: 1 },
              { x: 2, y: 0, row: 0, col: 2 },
              { x: 3, row: 0, col: 3 }
            ]
          }
        }
      },
      message: 'Key definition at layouts[LAYOUT].layout[3] must include "y" position'
    },
    {
      name: 'optional u must be number',
      input: {
        layouts: {
          LAYOUT: {
            layout: [
              { x: 0, y: 0, row: 0, col: 0 },
              { x: 1, y: 0, row: 0, col: 1 },
              { x: 2, y: 0, row: 0, col: 2 },
              { x: 3, y: 0, row: 0, col: 3, u: 'wide' }
            ]
          }
        }
      },
      message: 'Key definition at layouts[LAYOUT].layout[3] optional "u" must be number'
    },
    {
      name: 'optional absent must be boolean',
      input: {
        layouts: {
          LAYOUT: {
            layout: [
              { x: 0, y: 0, row: 0, col: 0 },
              { x: 1, y: 0, row: 0, col: 1 },
              { x: 2, y: 0, row: 0, col: 2 },
              { x: 3, y: 0, row: 0, col: 3, absent: 'yes' }
            ]
          }
        }
      },
      message: 'Key definition at layouts[LAYOUT].layout[3] optional "absent" must be boolean'
    },
    {
      name: 'missing row when any key has matrix position',
      input: {
        layouts: {
          LAYOUT: {
            layout: [
              { x: 0, y: 0, row: 0, col: 0 },
              { x: 1, y: 0, row: 0, col: 1 },
              { x: 2, y: 0, row: 0, col: 2 },
              { x: 3, y: 0, col: 3 }
            ]
          }
        }
      },
      message: 'Key definition at layouts[LAYOUT].layout[3] is missing "row"'
    },
    {
      name: 'col must be a non-negative integer',
      input: {
        layouts: {
          LAYOUT: {
            layout: [
              { x: 0, y: 0, row: 0, col: 0 },
              { x: 1, y: 0, row: 0, col: 1 },
              { x: 2, y: 0, row: 0, col: 2 },
              { x: 3, y: 0, row: 0, col: -1 }
            ]
          }
        }
      },
      message: 'Key definition at layouts[LAYOUT].layout[3] "col" must be a non-negative integer'
    }
  ]

  it.each(cases)('$name', ({ input, message }) => {
    expect(() => validateInfoJson(input)).toThrow(InfoValidationError)
    try {
      validateInfoJson(input)
      expect.unreachable('expected validation to fail')
    } catch (err) {
      expect(err).toBeInstanceOf(InfoValidationError)
      const errors = (err as InfoValidationError).errors
      if (typeof message === 'string') expect(errors).toContain(message)
      else expect(errors.some(item => message.test(item))).toBe(true)
    }
  })

  it('accepts a four-key LAYOUT', () => {
    expect(() => validateInfoJson(VALID_INFO)).not.toThrow()
  })
})

describe('untrusted JSON does not throw native errors', () => {
  it('validateInfoJson, validateKeymapJson, and parseKeymap reject junk as domain errors', () => {
    fc.assert(
      fc.property(untrustedArb(VALID_INFO), untrustedArb(VALID_KEYMAP), (info, keymap) => {
        expectCaught(() => validateInfoJson(info), [InfoValidationError])
        expectCaught(() => validateKeymapJson(keymap), [KeymapValidationError])
        expectCaught(() => parseKeymap(keymap as never), [KeymapValidationError])
      }),
      FC
    )
  })

  it('parseHostKeymapSnapshot returns { ok: false, error } and never throws', () => {
    fc.assert(
      fc.property(untrustedArb(VALID_SNAPSHOT), input => {
        let result: ReturnType<typeof parseHostKeymapSnapshot>
        try {
          result = parseHostKeymapSnapshot(input)
        } catch (err) {
          expect.fail(`parseHostKeymapSnapshot threw ${nativeThrowMessage(err)}`)
        }
        if (!result.ok) {
          expect(result).toHaveProperty('error')
          expect(['missing', 'invalid', 'unsupported_version']).toContain(result.error)
        }
      }),
      FC
    )
  })

  it('still accepts the valid fixtures', () => {
    expect(() => validateInfoJson(LARK_INFO)).not.toThrow()
    expect(() => validateInfoJson(VALID_INFO)).not.toThrow()
    expect(() => validateKeymapJson(VALID_KEYMAP)).not.toThrow()
    expect(parseKeymap(VALID_KEYMAP).layers).toHaveLength(2)
    expect(parseHostKeymapSnapshot(VALID_SNAPSHOT).ok).toBe(true)
  })
})

describe('untrusted text parsers throw domain errors only', () => {
  it('parseDtsKeymap, parseKlc, and hostLayoutFromXkb on random strings', () => {
    fc.assert(
      fc.property(shortStringArb, text => {
        expectCaught(() => parseDtsKeymap(text), [KeymapValidationError])
        expectCaught(() => parseKlc(text), [Error])
        expectCaught(() => hostLayoutFromXkb(text, 'basic', { fileName: 'paste' }), [Error])
      }),
      FC
    )
  })

  it('truncated fixtures stay on domain errors', () => {
    for (const text of truncated(LARK_KEYMAP)) {
      expectCaught(() => parseDtsKeymap(text), [KeymapValidationError])
    }
    for (const text of truncated(KLC_FIXTURE)) {
      expectCaught(() => parseKlc(text), [Error])
    }
    for (const text of truncated(XKB_AU)) {
      expectCaught(() => hostLayoutFromXkb(text, 'basic', { fileName: 'au' }), [Error])
    }
  })

  it('parseKlc failures are KlcParseError, not TypeError', () => {
    try {
      parseKlc('')
      expect.unreachable('empty klc should fail')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(TypeError)
      expect((err as Error).name).toBe('KlcParseError')
    }
  })
})
