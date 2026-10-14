import { expect, type Page, test } from '@playwright/test'
import { editKey, openSource, pickHostCatalogGlyph, readDraftCount } from './helpers'
import {
  ARTIFACT_ID,
  BRANCH_FEATURE,
  HEAD_SHA,
  INSTALLATION_ID,
  REPO_FULL_NAME,
  installGithubMocks
} from './github-mock'

const LARK_E = '.key[data-label="2,3"]'
const NEW_KEYCODE = 'F13'
const STALE_NOTICE = 'Branch changed on GitHub — reload'

async function showSourceMenu(page: Page) {
  const trigger = page.getByTestId('source-menu-trigger')
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
}

async function readRecovery(page: Page) {
  return page.evaluate(async () => {
    const result: Record<string, Array<{ id: string; [key: string]: unknown }>> = {}
    for (const name of ['keymap-editor-drafts', 'keymap-editor-host-profiles']) {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(name)
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
      for (const store of db.objectStoreNames) {
        result[`${name}/${store}`] = await new Promise((resolve, reject) => {
          const request = db.transaction(store, 'readonly').objectStore(store).getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      }
      db.close()
    }
    return result
  })
}

const draftsKey = 'keymap-editor-drafts/drafts'
const settingsKey = 'keymap-editor-host-profiles/settings'
const hostRows = (rows: Awaited<ReturnType<typeof readRecovery>>) => rows[settingsKey].filter(row => row.id.startsWith('github-host:'))

async function skipCoachAndGoto(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coachTourDone', '1')
  })
  await page.goto('/')
  await openSource(page, 'GitHub')
  await expect(page.getByText(REPO_FULL_NAME)).toBeVisible()
  const branch = page.getByLabel('Branch')
  await expect(branch).toBeVisible()
  await branch.selectOption({ label: BRANCH_FEATURE })
  await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
    `${REPO_FULL_NAME} · ${BRANCH_FEATURE}`
  )
  await expect(
    page.locator(LARK_E).getByRole('button', { name: '&kp E, layer 0' })
  ).toBeVisible()
}

async function applyEToF13(page: Page) {
  await editKey(
    page,
    page.locator(LARK_E).getByRole('button', { name: '&kp E, layer 0' }),
    NEW_KEYCODE
  )
  await expect(
    page.locator(LARK_E).getByRole('button', { name: `&kp ${NEW_KEYCODE}, layer 0` })
  ).toBeVisible()
}

test.describe('GitHub source (mocked API)', () => {
  test('two-file selection retains A recovery and commits only the explicitly selected B', async ({ page }) => {
    const github = await installGithubMocks(page, { paths: ['config/a.keymap', 'config/b.keymap'] })
    const before = new Map(github.remoteFiles)
    await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
    await page.goto('/')
    await openSource(page, 'GitHub')
    const files = page.getByLabel('Keymap file')
    await expect(files).toBeVisible()
    expect(github.loads).toEqual([])
    await files.selectOption('config/a.keymap')
    await applyEToF13(page)
    await showSourceMenu(page)
    await files.selectOption('config/b.keymap')
    await expect(page.locator(LARK_E).getByRole('button', { name: '&kp E, layer 0' })).toBeVisible()
    await expect.poll(async () => JSON.stringify((await readRecovery(page))[draftsKey])).toContain('F13')
    await editKey(page, page.locator(LARK_E).getByRole('button', { name: '&kp E, layer 0' }), 'F14')
    await page.getByRole('button', { name: 'Commit', exact: true }).click()
    await expect.poll(() => github.commits.length).toBe(1)
    expect(github.commits[0]).toMatchObject({ keymapPath: 'config/b.keymap', baseSha: HEAD_SHA })
    await expect(page.getByRole('button', { name: 'Commit', exact: true })).toBeDisabled()
    expect(github.remoteFiles.get('config/b.keymap')).toContain('F14')
    for (const [path, bytes] of before) {
      if (path.startsWith('config/b.keymap') || path.startsWith('host_keymap/keymaps/b.keymap/')) continue
      expect(github.remoteFiles.get(path), path).toBe(bytes)
    }
    const storedA = (await readRecovery(page))[draftsKey].find(row => row.id.includes('config/a.keymap'))
    expect(JSON.stringify(storedA)).toContain('F13')
    expect(JSON.stringify(storedA)).not.toContain('F14')
    await showSourceMenu(page)
    const restore = page.waitForEvent('dialog').then(async dialog => {
      expect(dialog.message()).toContain('Restore it?')
      await dialog.accept()
    })
    await files.selectOption('config/a.keymap')
    await restore
    await expect(page.locator(LARK_E).getByRole('button', { name: '&kp F13, layer 0' })).toBeVisible()
    expect((await readRecovery(page))[draftsKey].find(row => row.id.includes('config/a.keymap'))).toEqual(storedA)
  })

  test('a vanished accepted path never falls back to the remaining sole file on reopen', async ({ page }) => {
    const github = await installGithubMocks(page, { paths: ['config/a.keymap', 'config/b.keymap'] })
    await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
    await page.goto('/')
    await openSource(page, 'GitHub')
    await page.getByLabel('Keymap file').selectOption('config/b.keymap')
    await expect(page.locator(LARK_E).getByRole('button', { name: '&kp E, layer 0' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('selectedSource'))).toBe('github')
    github.removeFile('config/b.keymap')
    const loads = [...github.loads]
    await page.reload()
    await expect(page.getByText('config/b.keymap is missing.', { exact: false })).toBeVisible()
    expect(github.loads).toEqual(loads)
    expect(github.commits).toEqual([])
    await expect(page.getByRole('heading', { name: 'Missing selected keymap' })).toBeVisible()
  })

  for (const hostError of ['invalid', 'unsupported_version'] as const) {
    for (const mixed of [false, true]) {
      test(`${hostError}: Reload and host-only discard protect ${mixed ? 'mixed' : 'host-only'} recovery`, async ({ page }) => {
        const github = await installGithubMocks(page, { hostError })
        const remote = new Map(github.remoteFiles)
        await skipCoachAndGoto(page)
        await pickHostCatalogGlyph(page, page.locator(LARK_E).getByRole('button', { name: '&kp E, layer 0' }), 'α Greek_alpha')
        if (mixed) await applyEToF13(page)
        await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
        await expect.poll(async () => JSON.stringify(hostRows(await readRecovery(page)))).toContain('α')
        if (mixed) await expect.poll(async () => JSON.stringify((await readRecovery(page))[draftsKey])).toContain('F13')
        await showSourceMenu(page)
        await page.getByRole('button', { name: 'Reload', exact: true }).click()
        await expect(page.getByRole('status', { name: 'Host publication status' })).toContainText('browser-local and unpublishable')
        await showSourceMenu(page)
        await page.getByRole('radio', { name: /^Demo / }).click()
        await expect(page.getByRole('radio', { name: /^GitHub / })).toHaveAttribute('aria-checked', 'true')
        await page.getByTestId('source-menu-trigger').click()
        const beforeCancel = await readRecovery(page)
        const discard = page.getByRole('button', { name: 'Discard local host edits', exact: true })
        const cancel = page.waitForEvent('dialog').then(async dialog => {
          expect(dialog.message()).toContain(`${REPO_FULL_NAME} · ${BRANCH_FEATURE} · config/lark.keymap`)
          expect(dialog.message()).toContain('Firmware drafts, history and remote files are unchanged')
          await dialog.dismiss()
        })
        await discard.click()
        await cancel
        expect(await readRecovery(page)).toEqual(beforeCancel)
        const confirm = page.waitForEvent('dialog').then(dialog => dialog.accept())
        await discard.click()
        await confirm
        await expect(discard).toBeHidden()
        const reset = await readRecovery(page)
        expect(reset[draftsKey]).toEqual(beforeCancel[draftsKey])
        const selectedHost = hostRows(reset).find(row => row.id.includes(`\u0000${BRANCH_FEATURE}\u0000`))!
        expect(selectedHost.workingEncoded).toBe(selectedHost.originEncoded)
        expect(hostRows(reset).filter(row => row.id !== selectedHost.id)).toEqual(hostRows(beforeCancel).filter(row => row.id !== selectedHost.id))
        expect(JSON.stringify(hostRows(reset))).not.toContain('α')
        expect(github.remoteFiles).toEqual(remote)
        expect(github.commits).toEqual([])
        if (mixed) await expect(page.locator(LARK_E).getByRole('button', { name: '&kp F13, layer 0' })).toBeVisible()
        await showSourceMenu(page)
        await page.getByRole('radio', { name: /^Demo / }).click()
        await expect(page.getByRole('radio', { name: /^Demo / })).toHaveAttribute('aria-checked', 'true')
        const restore = mixed ? page.waitForEvent('dialog').then(dialog => dialog.accept()) : Promise.resolve()
        await page.getByRole('radio', { name: /^GitHub / }).click()
        await restore
        await expect(page.locator(LARK_E).getByRole('button', { name: `&kp ${mixed ? 'F13' : 'E'}, layer 0` })).toBeVisible()
        await expect(discard).toBeHidden()
        expect(JSON.stringify(hostRows(await readRecovery(page)))).not.toContain('α')
        expect(github.remoteFiles).toEqual(remote)
      })
    }
  }

  test('firmware-only Commit retains omitted host recovery through browser reload', async ({ page }) => {
    const github = await installGithubMocks(page, { hostError: 'invalid' })
    const remote = new Map(github.remoteFiles)
    await skipCoachAndGoto(page)
    await pickHostCatalogGlyph(page, page.locator(LARK_E).getByRole('button', { name: '&kp E, layer 0' }), 'α Greek_alpha')
    await applyEToF13(page)
    await page.getByRole('button', { name: 'Commit', exact: true }).click()
    await expect.poll(() => github.commits.length).toBe(1)
    expect(github.commits[0]).toMatchObject({ keymapPath: 'config/lark.keymap', hostSnapshot: null, hostDeliverables: [] })
    await expect(page.getByRole('button', { name: 'Commit', exact: true })).toBeDisabled()
    await expect(page.getByRole('status', { name: 'Host publication status' })).toContainText('Commit cannot save them')
    await expect.poll(async () => JSON.stringify(hostRows(await readRecovery(page)))).toContain('α')
    for (const [path, bytes] of remote) if (!path.startsWith('config/lark.keymap')) expect(github.remoteFiles.get(path), path).toBe(bytes)
    expect(github.remoteFiles.get('config/lark.keymap')).toContain('F13')
    const leave = page.waitForEvent('dialog').then(async dialog => { expect(dialog.type()).toBe('beforeunload'); await dialog.accept() })
    await Promise.all([page.reload(), leave])
    await expect(page.getByRole('button', { name: 'Discard local host edits', exact: true })).toBeVisible()
    await expect(page.locator(LARK_E).getByRole('button', { name: '&kp F13, layer 0' })).toBeVisible()
    expect(JSON.stringify(hostRows(await readRecovery(page)))).toContain('α')
    await showSourceMenu(page)
    await page.getByRole('radio', { name: /^Demo / }).click()
    await expect(page.getByRole('radio', { name: /^GitHub / })).toHaveAttribute('aria-checked', 'true')
  })

  test('selects repo and branch, then Commit sends layout, edit, snapshot, and baseSha', async ({
    page
  }) => {
    const github = await installGithubMocks(page)
    await skipCoachAndGoto(page)
    await applyEToF13(page)

    const commit = page.getByRole('button', { name: 'Commit' })
    await expect(commit).toBeEnabled()
    await commit.click()

    await expect.poll(() => github.commits.length).toBe(1)
    const body = github.commits[0] as {
      layout: unknown
      keymap: { layers?: unknown }
      hostSnapshot: { version?: unknown }
      hostDeliverables: Array<{ path?: string }> | null
      baseSha: unknown
    }
    expect(Array.isArray(body.layout)).toBe(true)
    expect((body.layout as unknown[]).length).toBeGreaterThan(0)
    expect(JSON.stringify(body.keymap.layers)).toContain(NEW_KEYCODE)
    expect(body.hostSnapshot.version).toBe(1)
    expect(Array.isArray(body.hostDeliverables)).toBe(true)
    expect(
      body.hostDeliverables?.some(file => file.path?.startsWith('host_keymap/'))
    ).toBe(true)
    expect(body.baseSha).toBe(HEAD_SHA)
  })

  test('Commit 409 StaleRepoBase shows a reload notice and keeps the draft', async ({
    page
  }) => {
    const github = await installGithubMocks(page)
    github.staleCommit()
    await skipCoachAndGoto(page)
    await applyEToF13(page)

    await page.getByRole('button', { name: 'Commit' }).click()
    await expect.poll(() => github.commits.length).toBe(1)
    await expect(page.getByRole('alert')).toContainText(STALE_NOTICE)
    await expect(
      page.locator(LARK_E).getByRole('button', { name: `&kp ${NEW_KEYCODE}, layer 0` })
    ).toBeVisible()
  })

  test('401 flushes the draft to IndexedDB before /github/authorize', async ({
    page
  }) => {
    const github = await installGithubMocks(page)
    await skipCoachAndGoto(page)
    await applyEToF13(page)
    expect(await readDraftCount(page)).toBe(0)

    github.failAuth()
    const trigger = page.getByTestId('source-menu-trigger')
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
      await trigger.click()
    }
    const reload = page.getByRole('button', { name: 'Reload' })
    await expect(reload).toBeVisible()
    await reload.click()
    await expect.poll(() => github.authorizeRequested).toBe(true)
    expect(await readDraftCount(page)).toBeGreaterThan(0)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  })

  test('firmware chip shows Latest with a /github/ download href', async ({
    page
  }) => {
    await installGithubMocks(page)
    await skipCoachAndGoto(page)

    const chip = page.getByRole('link', { name: /Latest/ })
    await expect(chip).toBeVisible()
    await expect
      .poll(async () => chip.getAttribute('href'))
      .toMatch(
        new RegExp(
          `/github/builds/${INSTALLATION_ID}/${encodeURIComponent(REPO_FULL_NAME)}/artifact/${ARTIFACT_ID}`
        )
      )
  })
})
