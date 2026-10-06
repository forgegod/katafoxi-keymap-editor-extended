import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = dirname(fileURLToPath(import.meta.url))
const CATALOG = join(SRC, '../../../packages/keymap-core/fixtures/demo/catalog.json')
const KEY_SVELTE = join(SRC, 'lib/components/Keyboard/Keys/Key.svelte')
const KEY_CSS = join(SRC, 'lib/components/Keyboard/Keys/Key.css')
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

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const pattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) {
    specifiers.push(match[1])
  }
  return specifiers
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

  it('does not put Cyrillic in UI sources', () => {
    const hits: string[] = []
    for (const file of files) {
      if (!file.endsWith('.svelte') && !file.endsWith('.ts')) continue
      const source = readFileSync(file, 'utf8')
      const rel = posixRel(file)
      for (const hit of lineHits(source, /\p{Script=Cyrillic}/u)) {
        hits.push(`${rel}:${hit}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('keeps Key.css as a non-empty sidecar imported by Key.svelte', () => {
    const svelte = readFileSync(KEY_SVELTE, 'utf8')
    const css = readFileSync(KEY_CSS, 'utf8')
    expect(svelte).toMatch(/import\s+['"]\.\/Key\.css['"]/)
    expect(css.trim().length).toBeGreaterThan(0)
    const styles = [...svelte.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    for (const block of styles) {
      expect(block[1]).not.toContain(':global(.key')
    }
  })

  it('does not reintroduce keycapColumns, {@html, or apps/api imports', () => {
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
      for (const specifier of importSpecifiers(source)) {
        const normalized = specifier.replaceAll('\\', '/')
        if (
          normalized.includes('apps/api') ||
          normalized === '@keymap-editor/api' ||
          normalized.startsWith('@keymap-editor/api/')
        ) {
          hits.push(`${rel}: import ${specifier}`)
        }
      }
    }
    expect(hits).toEqual([])
  })
})
