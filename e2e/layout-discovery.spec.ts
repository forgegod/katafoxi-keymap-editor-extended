import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openSource, editKey, readDraftCount, reloadAndResolveUnpublishedDraft } from './helpers'
import { installGithubMocks, HEAD_SHA, REPO_FULL_NAME } from './github-mock'
import { inferRectangularLayout, parseDtsKeymap, parseKeymap } from '../packages/keymap-core/dist/index.js'
import type { StoredDraft } from '../apps/web/src/lib/draft-storage'

const code = '/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A &kp B &kp C &kp D>; }; }; };'
const metadata = readFileSync('packages/keymap-core/fixtures/layout-discovery/unibody.dtsi', 'utf8')
const catalog = (source = metadata) => JSON.stringify({ version: 'synthetic-v1', entries: [{
  id: 'synthetic-board', board: 'synthetic-board', revision: '1', stockIncludes: [], metadata: source,
  attribution: { url: 'https://example.invalid/synthetic', commit: 'a'.repeat(40), license: 'MIT', notice: 'Synthetic test fixture', path: 'unibody.dtsi' }
}] })
async function clipboard(page: Page, info = '') {
  await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
  await page.goto('/')
  await openSource(page, 'Clipboard')
  await page.getByPlaceholder('Paste your board .keymap (preferred). keymap.json also loads for editing.').fill(code)
  if (info) await page.getByPlaceholder(/Optional. Without it/).fill(info)
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeVisible()
}
async function preview(page: Page, input = catalog()) {
  await page.getByRole('button', { name: 'Layout discovery', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Layout discovery', exact: true })
  await dialog.getByLabel('Catalog JSON').fill(input)
  await dialog.getByRole('button', { name: 'Load catalog', exact: true }).click()
  await dialog.getByLabel('Board / shield / revision').selectOption('synthetic-board')
  await dialog.getByRole('button', { name: 'Preview layout', exact: true }).click()
  return dialog
}

async function githubWithoutGeometry(page: Page) {
  const github = await installGithubMocks(page)
  await page.route('**/github/keyboard-files/**', async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ json: { info: null, keymap: parseKeymap(parseDtsKeymap(code)), layoutSource: code,
      headSha: HEAD_SHA, keymapPath: 'config/lark.keymap', ownershipMode: 'scoped', hostSnapshot: null } })
  })
  await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
  await page.goto('/')
  await openSource(page, 'GitHub')
  await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeVisible()
  const trigger = page.getByTestId('source-menu-trigger')
  if (await trigger.getAttribute('aria-expanded') === 'true') await trigger.click()
  return github
}

async function acceptPreview(page: Page) {
  const dialog = await preview(page)
  await dialog.getByLabel('I acknowledge unverified firmware compatibility and trust this catalog provenance').check()
  await dialog.getByRole('button', { name: 'Accept layout', exact: true }).click()
  await expect(dialog).toBeHidden()
  // Binding zero is below/right of binding one only in the discovered transform.
  await expect.poll(async () => {
    const first = await page.locator('.key').nth(0).boundingBox()
    const second = await page.locator('.key').nth(1).boundingBox()
    return first!.x > second!.x && first!.y > second!.y
  }).toBe(true)
}

async function readDrafts(page: Page): Promise<StoredDraft[]> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('keymap-editor-drafts')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const request = db.transaction('drafts', 'readonly').objectStore('drafts').getAll()
      request.onsuccess = () => { db.close(); resolve(request.result) }
      request.onerror = () => { db.close(); reject(request.error) }
    }
  }))
}

async function expectRectangle(page: Page) {
  await expect.poll(async () => {
    const keys = await page.locator('.key').evaluateAll(elements => elements.map(element => {
      const { x, y } = element.getBoundingClientRect()
      return { x, y }
    }))
    return keys.length === 4 && keys.every((key, index) => key.y === keys[0].y && (!index || key.x > keys[index - 1].x))
  }).toBe(true)
}

for (const discovered of [false, true]) {
  test(`Clipboard Copy ${discovered ? 'after discovery' : 'without discovery'} keeps loaded geometry for later Discard`, async ({ page, context }) => {
    await clipboard(page)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
    await expectRectangle(page)
    if (discovered) await acceptPreview(page)
    await editKey(page, page.getByRole('button', { name: '&kp A, layer 0', exact: true }), 'F13')
    await page.getByRole('button', { name: 'Copy .keymap', exact: true }).click()
    const exported = page.getByRole('dialog', { name: 'Exported keymap', exact: true })
    await expect(exported.getByRole('status').filter({ hasText: 'Copied to the system clipboard' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('&kp F13')
    await exported.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeDisabled()
    await editKey(page, page.getByRole('button', { name: '&kp F13, layer 0', exact: true }), 'F14')
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
    await expect(page.getByRole('button', { name: '&kp F13, layer 0', exact: true })).toBeVisible()
    await expectRectangle(page)
    await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeDisabled()
    await expect.poll(() => readDraftCount(page)).toBe(0)
  })
}

test('accepted discovery does not block Create branch carry or replace either recovery baseline', async ({ page }) => {
  const github = await githubWithoutGeometry(page)
  const remote = new Map(github.remoteFiles)
  const creates: unknown[] = []
  await page.route('**/github/installation/**/branches', async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    creates.push(route.request().postDataJSON())
    await route.fulfill({ json: { name: 'discovered-topic' } })
  })
  await acceptPreview(page)
  await editKey(page, page.getByRole('button', { name: '&kp A, layer 0', exact: true }), 'F13')
  await expect.poll(() => readDraftCount(page)).toBe(1)
  await page.getByTestId('source-menu-trigger').click()
  await page.getByRole('button', { name: 'Create new branch', exact: true }).click()
  await page.locator('#new-branch').fill('discovered-topic')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(`${REPO_FULL_NAME} · discovered-topic`)
  await expect(page.getByLabel('Branch', { exact: true }).locator('option:checked')).toHaveText('discovered-topic')
  await expect(page.getByRole('button', { name: '&kp F13, layer 0', exact: true })).toBeVisible()
  await expect.poll(() => readDraftCount(page)).toBe(2)
  const rows = await readDrafts(page)
  expect(rows.map(row => row.branch).sort()).toEqual(['discovered-topic', 'main'])
  for (const row of rows) {
    expect(row.githubBaseline).toEqual({ headSha: HEAD_SHA, keymap: parseKeymap(parseDtsKeymap(code)), layout: inferRectangularLayout(4) })
    expect(row.draftKeymap).toEqual(parseKeymap(parseDtsKeymap(code.replace('&kp A', '&kp F13'))))
  }
  expect(creates).toEqual([{ name: 'discovered-topic', from: 'main' }])
  expect(github.commits).toEqual([])
  expect(github.remoteFiles).toEqual(remote)
})

test('dirty edit recovery after accepted discovery reloads repository geometry and Discard restores firmware', async ({ page }) => {
  const github = await githubWithoutGeometry(page)
  const remote = new Map(github.remoteFiles)
  await expectRectangle(page)
  await acceptPreview(page)
  await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeDisabled()
  await editKey(page, page.getByRole('button', { name: '&kp A, layer 0', exact: true }), 'F13')
  await expect.poll(() => readDraftCount(page)).toBe(1)
  const stored = (await readDrafts(page))[0]
  await reloadAndResolveUnpublishedDraft(page, true)
  await expect(page.getByRole('button', { name: '&kp F13, layer 0', exact: true })).toBeVisible()
  await expectRectangle(page)
  expect(stored.githubBaseline).toEqual({ headSha: HEAD_SHA, keymap: parseKeymap(parseDtsKeymap(code)), layout: inferRectangularLayout(4) })
  expect((await readDrafts(page))[0]).toEqual(stored)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
  await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeVisible()
  await expectRectangle(page)
  await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeDisabled()
  await expect.poll(() => readDraftCount(page)).toBe(0)
  expect(github.commits).toEqual([])
  expect(github.remoteFiles).toEqual(remote)
})

test('known transform previews provenance, explicitly exports, cancels and accepts without firmware writes', async ({ page }) => {
  await clipboard(page)
  const before = await page.locator('.key').first().boundingBox()
  let dialog = await preview(page)
  await expect(dialog).toContainText('Inferred electrical arrangement — not measured physical geometry')
  await expect(dialog).toContainText('synthetic-v1/')
  await expect(dialog).toContainText('MIT')
  await expect(dialog.getByRole('button', { name: 'Accept layout', exact: true })).toBeDisabled()
  const downloadEvent = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export layout JSON', exact: true }).click()
  const download = await downloadEvent
  const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'))
  expect(exported.layouts.default.layout.map((key: { x: number; y: number }) => [key.x, key.y])).toEqual([[1, 1], [0, 0], [0, 1], [1, 0]])
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await page.locator('.key').first().boundingBox()).toEqual(before)
  dialog = await preview(page)
  await dialog.getByLabel('I acknowledge unverified firmware compatibility and trust this catalog provenance').check()
  await dialog.getByRole('button', { name: 'Accept layout', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/Layout accepted for this session/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeDisabled()
  await editKey(page, page.getByRole('button', { name: '&kp A, layer 0', exact: true }), 'F13')
  await expect(page.getByRole('button', { name: '&kp F13, layer 0', exact: true })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
  await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeVisible()
  await expectRectangle(page)
  await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeDisabled()
})

test('repository without info.json uses the rectangle, previews a known transform and never writes remotely', async ({ page }) => {
  const github = await installGithubMocks(page)
  const remote = new Map(github.remoteFiles)
  await page.route('**/github/keyboard-files/**', async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ json: { info: null, keymap: parseKeymap(parseDtsKeymap(code)), layoutSource: code,
      headSha: HEAD_SHA, keymapPath: 'config/lark.keymap', ownershipMode: 'scoped', hostSnapshot: null } })
  })
  await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
  await page.goto('/')
  await openSource(page, 'GitHub')
  await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeVisible()
  // Close the source popover before using editor chrome.
  const trigger = page.getByTestId('source-menu-trigger')
  if (await trigger.getAttribute('aria-expanded') === 'true') await trigger.click()
  const dialog = await preview(page)
  await expect(dialog).toContainText(HEAD_SHA)
  await dialog.getByLabel('I acknowledge unverified firmware compatibility and trust this catalog provenance').check()
  await dialog.getByRole('button', { name: 'Accept layout', exact: true }).click()
  const accepted = await page.locator('.key').first().boundingBox()
  await trigger.click()
  await trigger.click()
  expect(await page.locator('.key').first().boundingBox()).toEqual(accepted)
  expect(github.commits).toEqual([])
  expect(github.remoteFiles).toEqual(remote)
})

for (const reason of ['unknown', 'invalid', 'unsupported'] as const) {
  test(`${reason} metadata preserves editable fallback and offers correction`, async ({ page }) => {
    await clipboard(page)
    const source = reason === 'invalid' ? metadata.replace('RC(1,1)', 'RC(0,0)')
      : reason === 'unsupported' ? '#include "unproved.dtsi"\n' + metadata : metadata
    const dialog = await preview(page, catalog(source))
    if (reason === 'unknown') {
      await dialog.getByLabel('Board / shield / revision').selectOption('')
      await dialog.getByRole('button', { name: 'Preview layout', exact: true }).click()
    }
    await expect(dialog.getByRole('status')).toContainText(reason === 'unknown' ? 'unknown-selection' : reason)
    await expect(dialog.getByRole('button', { name: 'Accept layout', exact: true })).toBeHidden()
    await expect(dialog.getByRole('button', { name: 'Export layout JSON', exact: true })).toBeHidden()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await editKey(page, page.getByRole('button', { name: '&kp A, layer 0', exact: true }), 'F13')
  })
}

test('ambiguous transforms require an explicit candidate and changing it invalidates confirmation', async ({ page }) => {
  await clipboard(page)
  const transform = (label: string) => `${label}: ${label} { compatible = "zmk,matrix-transform"; rows = <2>; columns = <2>; map = <RC(1,1) RC(0,0) RC(0,1) RC(1,0)>; };`
  const dialog = await preview(page, catalog(`/ { ${transform('first')} ${transform('second')} };`))
  await expect(dialog.getByRole('status')).toContainText('ambiguous')
  await dialog.getByLabel('Candidate type').selectOption('transform')
  await dialog.getByLabel('Candidate label').fill('second')
  await dialog.getByRole('button', { name: 'Preview layout', exact: true }).click()
  await expect(dialog).toContainText('Transform: second')
  await dialog.getByLabel('I acknowledge unverified firmware compatibility and trust this catalog provenance').check()
  await dialog.getByLabel('Candidate label').fill('first')
  await expect(dialog.getByRole('button', { name: 'Accept layout', exact: true })).toBeHidden()
  await dialog.getByRole('button', { name: 'Preview layout', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Accept layout', exact: true })).toBeDisabled()
})

test('supplied geometry wins and cannot be replaced by discovery', async ({ page }) => {
  const layout = Array.from({ length: 4 }, (_, col) => ({ row: 0, col, x: col * 2, y: 0 }))
  await clipboard(page, JSON.stringify({ layouts: { default: { layout } } }))
  await page.getByRole('button', { name: 'Layout discovery', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Layout discovery', exact: true })
  await expect(dialog.getByRole('alert')).toContainText('Supplied layout JSON takes precedence')
  await expect(dialog.getByLabel('Catalog JSON')).toBeHidden()
})
