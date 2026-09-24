import { expect, type Page, test } from '@playwright/test'
import fs from 'node:fs'
import {
  copyLarkFixture,
  preambleBeforeKeymap,
  tempKeymapPath
} from './lark-temp'

const DRAFT_CONFIRM_PREFIX = 'An unpublished draft was saved in this browser'
const ESC_KEY = '.key[data-label="1,0"]'
const NEW_KEYCODE = 'F13'
const ORIGINAL_BIND = '&kp ESC'
const EDITED_BIND = `&kp ${NEW_KEYCODE}`

function zmkConfigRoot() {
  const dir = process.env.E2E_ZMK_CONFIG
  if (!dir) throw new Error('E2E_ZMK_CONFIG is not set')
  return dir
}

function readTempKeymap() {
  return fs.readFileSync(tempKeymapPath(zmkConfigRoot()), 'utf8')
}

async function openLocalEditor(page: Page) {
  await page.goto('/')
  const source = page.locator('#source')
  await expect(source).toBeVisible()
  await expect(source.locator('option:checked')).toHaveText('Local')
  await expect(page.locator(ESC_KEY)).toBeVisible()
}

async function applyEscToF13(page: Page) {
  const key = page.locator(ESC_KEY)
  await key.scrollIntoViewIfNeeded()
  await key.click()

  const dialog = page.getByRole('dialog', { name: 'Edit key' })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder('Filter values…').fill(NEW_KEYCODE)
  await dialog.locator('.key-editor-choice', { hasText: NEW_KEYCODE }).first().click()
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect(dialog).toBeHidden()
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

    await expect(page.getByText('Up to date with disk')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Write files' })).toBeDisabled()

    const written = readTempKeymap()
    expect(preambleBeforeKeymap(written)).toBe(originalPreamble)
    const layer0 = written.slice(written.indexOf('layer_0'), written.indexOf('layer_1'))
    expect(layer0).toContain(EDITED_BIND)
    expect(layer0).not.toContain(ORIGINAL_BIND)
  })

  test('reload prompts to restore an unpublished IndexedDB draft', async ({
    page
  }) => {
    const originalPreamble = preambleBeforeKeymap(readTempKeymap())

    await openLocalEditor(page)
    await applyEscToF13(page)
    await expect(page.getByRole('button', { name: 'Write files' })).toBeEnabled()

    // Editor persists dirty drafts after PERSIST_DEBOUNCE_MS (400).
    await page.waitForTimeout(700)

    const dialogPromise = page.waitForEvent('dialog')
    await page.reload()
    const confirm = await dialogPromise
    expect(confirm.message().startsWith(DRAFT_CONFIRM_PREFIX)).toBeTruthy()
    await confirm.dismiss()

    expect(preambleBeforeKeymap(readTempKeymap())).toBe(originalPreamble)
    expect(readTempKeymap()).toContain(ORIGINAL_BIND)
    expect(readTempKeymap()).not.toContain(EDITED_BIND)
  })
})
