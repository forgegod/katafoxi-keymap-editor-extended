import { expect, type Locator, type Page } from '@playwright/test'

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
