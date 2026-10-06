import { expect, type Page, test } from '@playwright/test'
import { editKey, openSource, readDraftCount } from './helpers'
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
