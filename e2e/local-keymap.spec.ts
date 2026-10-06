import { expect, type Page, test } from '@playwright/test'
import fs from 'node:fs'
import {
  copyLarkFixture,
  preambleBeforeKeymap,
  tempKeymapPath
} from './lark-temp'

const DRAFT_CONFIRM_PREFIX = 'An unpublished draft was saved in this browser'
const ESC_KEY = '.key[data-label="1,0"]'
const E_KEY = '.key[data-label="2,3"]'
const NEW_KEYCODE = 'F13'
const ORIGINAL_BIND = '&kp ESC'
const EDITED_BIND = `&kp ${NEW_KEYCODE}`
const LAYER2_ORIGINAL_BIND = '&kp F8'
const LAYER0_E_BIND = '&kp E'

function zmkConfigRoot() {
  const dir = process.env.E2E_ZMK_CONFIG
  if (!dir) throw new Error('E2E_ZMK_CONFIG is not set')
  return dir
}

function readTempKeymap() {
  return fs.readFileSync(tempKeymapPath(zmkConfigRoot()), 'utf8')
}

async function openLocalEditor(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coachTourDone', '1')
  })
  await page.goto('/')
  const trigger = page.getByTestId('source-menu-trigger')
  await expect(trigger).toBeVisible()
  await trigger.click()
  const local = page.getByRole('radio', { name: /Local/ })
  await expect(local).toBeVisible()
  await local.click()
  await expect(local).toHaveAttribute('aria-checked', 'true')
  await expect(trigger).toHaveAccessibleName('Local files')
  await expect(
    page.locator(ESC_KEY).getByRole('button', { name: '&kp ESC, layer 0' })
  ).toBeVisible()
  const popover = page.locator('.source-popover')
  if ((await popover.getAttribute('hidden')) === null) {
    await trigger.click()
  }
  await expect(popover).toHaveAttribute('hidden', '')
}

async function waitForPersistedDraft(page: Page) {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return new Promise<number>((resolve, reject) => {
          const request = indexedDB.open('keymap-editor-drafts')
          request.onerror = () => reject(request.error ?? new Error('IDB open failed'))
          request.onsuccess = () => {
            const db = request.result
            if (!db.objectStoreNames.contains('drafts')) {
              db.close()
              resolve(0)
              return
            }
            const tx = db.transaction('drafts', 'readonly')
            const count = tx.objectStore('drafts').count()
            count.onsuccess = () => {
              db.close()
              resolve(count.result)
            }
            count.onerror = () => {
              db.close()
              reject(count.error ?? new Error('IDB count failed'))
            }
          }
        })
      })
    })
    .toBeGreaterThan(0)
}

async function applyEscToF13(page: Page) {
  await page
    .locator(ESC_KEY)
    .getByRole('button', { name: '&kp ESC, layer 0' })
    .click()
  await applyF13InEditor(page)
}

async function applyF13InEditor(page: Page) {
  const dialog = page.locator('.key-editor[aria-label="Edit key"]')
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder('Filter values…').fill(NEW_KEYCODE)
  await dialog.locator('.key-editor-choice', { hasText: NEW_KEYCODE }).first().click()
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect(dialog).toBeHidden()
}

function layerSlice(source: string, start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end))
}

test.describe.configure({ mode: 'serial' })

test.describe('local adapter smoke', () => {
  test.beforeEach(() => {
    copyLarkFixture(zmkConfigRoot())
  })

  test.afterAll(() => {
    const dir = process.env.E2E_ZMK_CONFIG
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  test('Write files splices a binding and keeps the .keymap preamble', async ({
    page
  }) => {
    const original = readTempKeymap()
    const originalPreamble = preambleBeforeKeymap(original)
    expect(original).toContain(ORIGINAL_BIND)
    expect(original).not.toContain(EDITED_BIND)

    await openLocalEditor(page)
    await applyEscToF13(page)

    const write = page.getByRole('button', { name: 'Write files' })
    await expect(write).toBeEnabled()
    await write.click()

    await expect(page.getByTitle('Up to date with disk')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Write files' })).toBeDisabled()

    const written = readTempKeymap()
    expect(preambleBeforeKeymap(written)).toBe(originalPreamble)
    const layer0 = layerSlice(written, 'layer_0', 'layer_1')
    expect(layer0).toContain(EDITED_BIND)
    expect(layer0).not.toContain(ORIGINAL_BIND)
  })

  test('composed row edit writes layer_2 and leaves layer_0 unchanged', async ({
    page
  }) => {
    const original = readTempKeymap()
    const originalLayer0 = layerSlice(original, 'layer_0', 'layer_1')
    const originalLayer2 = layerSlice(original, 'layer_2', 'layer_3')
    expect(originalLayer2).toContain(LAYER2_ORIGINAL_BIND)
    expect(originalLayer2).not.toContain(EDITED_BIND)
    expect(originalLayer0).toContain(LAYER0_E_BIND)
    expect(originalLayer0).not.toContain(EDITED_BIND)

    await openLocalEditor(page)

    const key = page.locator(E_KEY)
    const layer2Row = key.locator('button.layer-slot[data-layer="2"]')
    await expect(layer2Row).toBeVisible()
    await layer2Row.click()
    await applyF13InEditor(page)

    const write = page.getByRole('button', { name: 'Write files' })
    await expect(write).toBeEnabled()
    await write.click()

    await expect(page.getByTitle('Up to date with disk')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Write files' })).toBeDisabled()

    const written = readTempKeymap()
    const layer0 = layerSlice(written, 'layer_0', 'layer_1')
    const layer2 = layerSlice(written, 'layer_2', 'layer_3')
    expect(layer2).toContain(EDITED_BIND)
    expect(layer2).not.toContain(LAYER2_ORIGINAL_BIND)
    expect(layer0).toContain(LAYER0_E_BIND)
    expect(layer0).not.toContain(EDITED_BIND)
  })

  test('reload prompts to restore an unpublished IndexedDB draft', async ({
    page
  }) => {
    const originalPreamble = preambleBeforeKeymap(readTempKeymap())

    await openLocalEditor(page)
    await applyEscToF13(page)
    await expect(page.getByRole('button', { name: 'Write files' })).toBeEnabled()

    await waitForPersistedDraft(page)

    const dialogPromise = page.waitForEvent('dialog')
    await page.reload()
    const confirm = await dialogPromise
    expect(confirm.message().startsWith(DRAFT_CONFIRM_PREFIX)).toBeTruthy()
    await confirm.dismiss()

    expect(preambleBeforeKeymap(readTempKeymap())).toBe(originalPreamble)
    expect(readTempKeymap()).toContain(ORIGINAL_BIND)
    expect(readTempKeymap()).not.toContain(EDITED_BIND)
  })

  test('decode card host level edit updates the keycap and survives reload', async ({
    page
  }) => {
    // Pick α from the collapsed Greek shelf (stable catalog path for ru).
    const hostGlyph = 'α'
    const glyphLabel = 'α Greek_alpha'

    await openLocalEditor(page)

    const key = page.locator(E_KEY)
    const layer0Row = key.locator('button.layer-slot[data-layer="0"]')
    await expect(layer0Row).toBeVisible()
    await expect(key.locator('.keycap')).not.toContainText(hostGlyph)

    const addLanguage = page.getByRole('button', { name: 'Computer language' })
    await expect(addLanguage).toBeVisible()
    await addLanguage.click()
    await page.getByRole('option', { name: 'Russian' }).click()
    await expect(page.getByRole('button', { name: /Profile Russian/ })).toBeVisible()

    // Alt+click is the only host-edit entry; then arm the open Russian column
    // so the keycap repaints immediately.
    await layer0Row.click({ modifiers: ['Alt'] })
    const decodeDialog = page.getByRole('dialog', { name: /Legend decode/ })
    await expect(decodeDialog).toBeVisible()
    await decodeDialog.getByRole('button', { name: 'Edit Russian tap' }).click()
    const catalog = page.getByRole('dialog', { name: 'Host symbol catalog' })
    await expect(catalog).toBeVisible()
    await expect(catalog.locator(`button.glyph[aria-label="${glyphLabel}"]`)).toHaveCount(0)

    const greekShelf = catalog.locator('[data-shelf="greek"]')
    await greekShelf.locator('button.shelf-toggle').click()
    await expect(greekShelf).toHaveAttribute('data-open', 'true')
    await catalog.locator(`button.glyph[aria-label="${glyphLabel}"]`).click()
    // Catalog stays open after a pick so shelf expand state survives the next assignment.
    await expect(catalog).toBeVisible()
    await expect(greekShelf).toHaveAttribute('data-open', 'true')

    await expect(page.getByRole('status')).toContainText('Created copy')
    await expect(key.locator('.keycap')).toContainText(hostGlyph)

    await page.reload()
    await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName('Local files')
    await expect(page.locator(E_KEY)).toBeVisible()
    await expect(page.locator(E_KEY).locator('.keycap')).toContainText(hostGlyph)
  })
})
