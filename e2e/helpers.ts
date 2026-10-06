import { expect, type Locator, type Page } from '@playwright/test'

/** Skip the first-visit coach and open the editor. */
export async function skipCoachAndOpenEditor(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coachTourDone', '1')
  })
  await page.goto('/')
  await expect(page.getByTestId('source-menu-trigger')).toBeVisible()
}

/** Open the source menu and select a keymap source radio (Demo, Local, …). */
export async function openSource(page: Page, name: string) {
  const trigger = page.getByTestId('source-menu-trigger')
  await expect(trigger).toBeVisible()
  await trigger.click()
  const radio = page.getByRole('radio', { name })
  await expect(radio).toBeVisible()
  await radio.click()
  await expect(radio).toHaveAttribute('aria-checked', 'true')
}

/** Click a layer-row control and apply a keycode in the Edit key dialog. */
export async function editKey(page: Page, key: Locator, code: string) {
  await key.click()
  const dialog = page.getByRole('dialog', { name: 'Edit key' })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder('Filter values…').fill(code)
  await dialog.getByRole('button', { name: code }).first().click()
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect(dialog).toBeHidden()
}

/**
 * Alt+click a composed key row, pick a catalog glyph, and Accept the host-edit
 * session so a user layout exists for Linux/Windows downloads.
 */
export async function pickHostCatalogGlyph(
  page: Page,
  keyRow: Locator,
  glyphName: string,
  shelf: { id: string; button: string } = { id: 'greek', button: 'Greek' }
) {
  await keyRow.click({ modifiers: ['Alt'] })
  const decodeDialog = page.getByRole('dialog', { name: /Legend decode/ })
  await expect(decodeDialog).toBeVisible()
  await decodeDialog.getByRole('button', { name: 'Edit English tap' }).click()
  const catalog = page.getByRole('dialog', { name: 'Host symbol catalog' })
  await expect(catalog).toBeVisible()
  const shelfRoot = catalog.locator(`[data-shelf="${shelf.id}"]`)
  await shelfRoot.getByRole('button', { name: shelf.button }).click()
  await expect(shelfRoot).toHaveAttribute('data-open', 'true')
  await catalog.getByRole('button', { name: glyphName, exact: true }).click()
  await page.getByRole('button', { name: /Accept/ }).click()
  await expect(decodeDialog).toBeHidden()
}

/** Click a control that starts a browser download and wait for the event. */
export async function clickAndDownload(page: Page, control: Locator) {
  const pending = page.waitForEvent('download')
  await control.click()
  return pending
}

/** Count unpublished keymap drafts in IndexedDB (`keymap-editor-drafts`). */
export async function readDraftCount(page: Page): Promise<number> {
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
}
