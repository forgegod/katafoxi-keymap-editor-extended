import { expect, type Page, test } from '@playwright/test'
import { editKey, openSource, readDraftCount, reloadAndResolveUnpublishedDraft } from './helpers'

const CORNE_E = '.key[data-label="E"]'
const LARK_E = '.key[data-label="2,3"]'
const NEW_KEYCODE = 'F13'
const HOST_GLYPH = 'α'
const HOST_GLYPH_LABEL = 'α Greek_alpha'

async function skipCoachAndGoto(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coachTourDone', '1')
  })
  await page.goto('/')
  await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
    'Demo keyboard: Corne'
  )
}

async function chooseDemo(page: Page, name: string) {
  await openSource(page, 'Demo')
  await page.getByRole('option', { name: new RegExp(`^${name}\\b`) }).click()
  await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
    `Demo keyboard: ${name}`
  )
}

test.describe('Demo source', () => {
  test('fresh visit loads the catalog default and can close the coach tour', async ({
    page
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
      'Demo keyboard: Corne'
    )
    await expect(page.getByText('Demo — not saved to a repo')).toBeVisible()
    const tour = page.getByRole('dialog', { name: 'Edit a key' })
    await expect(tour).toBeVisible()
    await tour.getByRole('button', { name: 'Skip' }).click()
    await expect(tour).toBeHidden()
  })

  test('applies Key.css so keys are positioned absolutely', async ({ page }) => {
    await skipCoachAndGoto(page)
    const key = page.locator('.keyboard-canvas .key').first()
    await expect(key).toBeVisible()
    await expect
      .poll(() => key.evaluate(el => getComputedStyle(el).position))
      .toBe('absolute')
  })

  test('native beforeunload dismissal keeps a real edit; acceptance closes the page', async ({
    page
  }) => {
    await skipCoachAndGoto(page)
    const eKey = page.locator(CORNE_E)
    await editKey(
      page,
      eKey.getByRole('button', { name: '&kp E, layer 0' }),
      NEW_KEYCODE
    )
    const editedRow = eKey.getByRole('button', { name: `&kp ${NEW_KEYCODE}, layer 0` })
    await expect(editedRow).toBeVisible()
    // A recovery copy must not count as publication or disarm the warning.
    await expect.poll(() => readDraftCount(page)).toBeGreaterThan(0)

    const [stay] = await Promise.all([
      page.waitForEvent('dialog', { timeout: 5_000 }),
      page.close({ runBeforeUnload: true })
    ])
    expect(stay.type()).toBe('beforeunload')
    await stay.dismiss()
    expect(page.isClosed()).toBe(false)
    await expect(editedRow).toBeVisible()
    await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeEnabled()

    const [leave] = await Promise.all([
      page.waitForEvent('dialog', { timeout: 5_000 }),
      page.close({ runBeforeUnload: true })
    ])
    expect(leave.type()).toBe('beforeunload')
    await Promise.all([page.waitForEvent('close'), leave.accept()])
    expect(page.isClosed()).toBe(true)
  })

  test('reload restore keeps an edit; Discard then reload has no prompt', async ({
    page
  }) => {
    await skipCoachAndGoto(page)
    const eKey = page.locator(CORNE_E)
    await editKey(
      page,
      eKey.getByRole('button', { name: '&kp E, layer 0' }),
      NEW_KEYCODE
    )
    await expect(
      eKey.getByRole('button', { name: `&kp ${NEW_KEYCODE}, layer 0` })
    ).toBeVisible()
    await expect.poll(() => readDraftCount(page)).toBeGreaterThan(0)

    await reloadAndResolveUnpublishedDraft(page, true)
    await expect(
      page
        .locator(CORNE_E)
        .getByRole('button', { name: `&kp ${NEW_KEYCODE}, layer 0` })
    ).toBeVisible()

    // Reload resets user activation. Reopen/cancel the key editor to provide
    // a real gesture without changing the restored draft before leaving again.
    await eKey.getByRole('button', { name: `&kp ${NEW_KEYCODE}, layer 0` }).click()
    await page.getByRole('dialog', { name: 'Edit key' }).getByRole('button', { name: 'Cancel', exact: true }).click()
    await reloadAndResolveUnpublishedDraft(page, false)
    await expect(
      page.locator(CORNE_E).getByRole('button', { name: '&kp E, layer 0' })
    ).toBeVisible()
    await expect.poll(() => readDraftCount(page)).toBe(0)

    // A clean reload must stay prompt-free even with user activation.
    await page.getByTestId('source-menu-trigger').click()
    await page.getByTestId('source-menu-trigger').click()
    const prompts: string[] = []
    page.on('dialog', dialog => {
      prompts.push(dialog.message())
      void dialog.dismiss()
    })
    await page.reload()
    await expect(
      page.locator(CORNE_E).getByRole('button', { name: '&kp E, layer 0' })
    ).toBeVisible()
    expect(prompts).toEqual([])
  })

  test('host layout edits persist when switching demo and back', async ({
    page
  }) => {
    await skipCoachAndGoto(page)
    await chooseDemo(page, 'Lark')

    const key = page.locator(LARK_E)
    const layer0 = key.getByRole('button', { name: '&kp E, layer 0' })
    await expect(layer0).toBeVisible()
    await expect(key.locator('.keycap')).not.toContainText(HOST_GLYPH)

    await layer0.click({ modifiers: ['Alt'] })
    const decodeDialog = page.getByRole('dialog', { name: /Legend decode/ })
    await expect(decodeDialog).toBeVisible()
    await decodeDialog.getByRole('button', { name: 'Edit English tap' }).click()
    const catalog = page.getByRole('dialog', { name: 'Host symbol catalog' })
    await expect(catalog).toBeVisible()
    const greekShelf = catalog.locator('[data-shelf="greek"]')
    await greekShelf.getByRole('button', { name: 'Greek' }).click()
    await expect(greekShelf).toHaveAttribute('data-open', 'true')
    await catalog.getByRole('button', { name: HOST_GLYPH_LABEL, exact: true }).click()
    await expect(key.locator('.keycap')).toContainText(HOST_GLYPH)

    await chooseDemo(page, 'Corne')
    await expect(page.locator(CORNE_E)).toBeVisible()

    await chooseDemo(page, 'Lark')
    await expect(page.locator(LARK_E).locator('.keycap')).toContainText(HOST_GLYPH)
  })
})
