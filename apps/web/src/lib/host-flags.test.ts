import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOST_LANGUAGES } from '@keymap-editor/keymap-core'
import { describe, expect, it } from 'vitest'

const FLAGS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/flags')

describe('vendored host-language flags', () => {
  it('ships an SVG for every HOST_LANGUAGES flagCode and nothing else', () => {
    const codes = HOST_LANGUAGES.map(language => language.flagCode)
    expect(new Set(codes).size).toBe(codes.length)

    for (const code of codes) {
      expect(existsSync(join(FLAGS_DIR, `${code}.svg`)), `${code}.svg`).toBe(true)
    }

    const names = readdirSync(FLAGS_DIR).sort()
    expect(names).toEqual([...codes.map(code => `${code}.svg`), 'LICENSE'].sort())
  })
})
