import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = dirname(fileURLToPath(import.meta.url))
const CATALOG = join(SRC, '../fixtures/demo/catalog.json')
const SOURCE_EXT = /\.(?:ts|js|svelte|css)$/

interface DemoCatalog {
  demos: Array<{ id: string; name: string }>
}

function posixRel(file: string): string {
  return relative(SRC, file).split(sep).join('/')
}

function shouldSkipDir(rel: string, name: string): boolean {
  if (name === '__golden__' || name === 'testing') return true
  return rel === 'lib/demo' || rel.startsWith('lib/demo/')
}

function shouldSkipFile(name: string): boolean {
  return name.endsWith('.test.ts') || name.endsWith('Harness.svelte')
}

function walkFiles(dir: string, rel = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (shouldSkipDir(childRel, entry.name)) continue
      out.push(...walkFiles(full, childRel))
      continue
    }
    if (shouldSkipFile(entry.name) || !SOURCE_EXT.test(entry.name)) continue
    out.push(full)
  }
  return out
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function boardWords(): string[] {
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8')) as DemoCatalog
  const raw = [...catalog.demos.flatMap(demo => [demo.id, demo.name]), 'lark']
  const unique = new Map<string, string>()
  for (const word of raw) {
    const trimmed = word.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (!unique.has(key)) unique.set(key, trimmed)
  }
  return [...unique.values()]
}

function lineHits(source: string, pattern: RegExp): string[] {
  return source
    .split(/\r?\n/)
    .flatMap((line, i) => (pattern.test(line) ? [`${i + 1}: ${line.trim()}`] : []))
}

describe('architecture invariants', () => {
  const files = walkFiles(SRC)

  it('does not name demo keyboards in product sources', () => {
    const words = boardWords()
    expect(words.length).toBeGreaterThan(0)
    const hits: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const rel = posixRel(file)
      for (const word of words) {
        const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i')
        for (const hit of lineHits(source, pattern)) {
          hits.push(`${rel}:${hit} (word ${word})`)
        }
      }
    }
    expect(hits).toEqual([])
  })

  it('does not reintroduce keycapColumns or {@html', () => {
    const hits: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const rel = posixRel(file)
      for (const hit of lineHits(source, /\bkeycapColumns\b/)) {
        hits.push(`${rel}:${hit}`)
      }
      for (const hit of lineHits(source, /\{@html/)) {
        hits.push(`${rel}:${hit}`)
      }
    }
    expect(hits).toEqual([])
  })
})
