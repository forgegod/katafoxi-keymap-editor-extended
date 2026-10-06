import { expect, test, type Page } from '@playwright/test'
import { decodeKlc, parseKlc } from '@keymap-editor/keymap-core'
import fs from 'node:fs'
import {
  clickAndDownload,
  pickHostCatalogGlyph,
  skipCoachAndOpenEditor
} from './helpers'

const CORNE_E = '.key[data-label="E"]'
const HOST_GLYPH_LABEL = 'α Greek_alpha'

async function openHostSheetWithUserLayout(page: Page, os: 'Linux' | 'Windows') {
  await skipCoachAndOpenEditor(page)
  await pickHostCatalogGlyph(
    page,
    page.locator(CORNE_E).getByRole('button', { name: '&kp E, layer 0' }),
    HOST_GLYPH_LABEL
  )
  const label =
    os === 'Linux'
      ? 'Install host layout on Linux'
      : 'Install host layout on Windows'
  await page.getByRole('button', { name: label }).click()
  const dialog = page.getByRole('dialog', {
    name: os === 'Linux' ? 'Install on Linux' : 'Install on Windows'
  })
  await expect(dialog).toBeVisible()
  return dialog
}

function xkbKeysyms(text: string): string[] {
  return [...text.matchAll(/key\s*<[^>]+>\s*\{\s*\[([^\]]*)\]/g)].flatMap(match =>
    match[1]
      .split(',')
      .map(token => token.trim())
      .filter(Boolean)
  )
}

test.describe('Host install downloads', () => {
  test('Windows Host lane downloads a UTF-16 LE .klc that parseKlc can read', async ({
    page
  }) => {
    const dialog = await openHostSheetWithUserLayout(page, 'Windows')
    const download = await clickAndDownload(
      page,
      dialog.getByRole('button', { name: 'Download .klc' })
    )
    expect(download.suggestedFilename()).toMatch(/\.klc$/i)
    const saved = await download.path()
    expect(saved).toBeTruthy()
    const bytes = new Uint8Array(fs.readFileSync(saved!))
    expect(bytes[0]).toBe(0xff)
    expect(bytes[1]).toBe(0xfe)
    const parsed = parseKlc(decodeKlc(bytes))
    expect(parsed.kind).toBe('single')
    expect(parsed.description.length).toBeGreaterThan(0)
  })

  test('Linux Host lane downloads xkb_symbols without any as a keysym', async ({
    page
  }) => {
    const dialog = await openHostSheetWithUserLayout(page, 'Linux')
    const download = await clickAndDownload(
      page,
      dialog.getByRole('button', { name: 'Download file' })
    )
    const saved = await download.path()
    expect(saved).toBeTruthy()
    const text = fs.readFileSync(saved!, 'utf8')
    const section = /xkb_symbols\s+"([^"]+)"/.exec(text)
    expect(section?.[1]).toBeTruthy()
    expect(xkbKeysyms(text).length).toBeGreaterThan(0)
    expect(xkbKeysyms(text)).not.toContain('any')
  })
})
