/**
 * Phase 3 browser workflow coverage for the one existing raw `.keymap`
 * filesystem source.
 *
 * Deterministic File System Access doubles come from `filesystem-doubles.ts`:
 * synthetic in-memory file entries with configurable selection, per-handle
 * permissions, same-entry ids, read/write/close calls, injected failures,
 * read-only directory children and a forbidden I/O log. No test writes real
 * files, requests real permissions, or touches a native picker. The tests
 * drive the real UI, editor and draft-storage seams — never mocked domain
 * functions.
 *
 * Covered controls: Filesystem source radio, Open file, Open folder,
 * Choose layout JSON, Open without layout, Save .keymap, Grant access,
 * Reconcile save, Reconnect, Restore draft, Discard firmware draft and
 * reload, Use Clipboard.
 *
 * These doubles prove application behavior, not native picker permissions or
 * operating-system crash durability.
 */

import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  countOps,
  fsDisk,
  fsIo,
  fsLog,
  fsPushFileQueue,
  fsSetDisk,
  fsSetFail,
  installFilesystemDoubles
} from './filesystem-doubles'
import { editKey } from './helpers'

const VALID_KEYMAP = [
  '#include <behaviors.dtsi>',
  '#include <dt-bindings/zmk/keys.h>',
  '',
  '/ {',
  '    keymap {',
  '        compatible = "zmk,keymap";',
  '        default_layer {',
  '            bindings = <&kp ESC &kp A>;',
  '        };',
  '    };',
  '};',
  ''
].join('\n')

const VALID_LAYOUT = JSON.stringify({
  id: 'test-board',
  layouts: { LAYOUT: { layout: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } }
})

function picker(page: Page): Locator {
  return page.locator('[data-filesystem-picker]')
}

function fsNotice(page: Page): Locator {
  return page.locator('[data-filesystem-picker] .fs-notice')
}

async function menuIsOpen(page: Page): Promise<boolean> {
  return page.locator('.source-popover').isVisible()
}

/** The picker lives in the source popover; reopen it through chrome when shut. */
async function openFilesystemActions(page: Page): Promise<Locator> {
  const scoped = picker(page)
  if (!(await menuIsOpen(page))) {
    const actions = page.getByRole('button', { name: 'Filesystem actions' })
    if ((await actions.count()) > 0) await actions.click()
    else await page.getByTestId('source-menu-trigger').click()
  }
  await expect(scoped).toBeVisible()
  return scoped
}

async function closeMenu(page: Page): Promise<void> {
  if (await menuIsOpen(page)) await page.getByTestId('source-menu-trigger').click()
  await expect(page.locator('.source-popover')).toBeHidden()
}

async function openFilesystemSource(page: Page): Promise<void> {
  const trigger = page.getByTestId('source-menu-trigger')
  await expect(trigger).toBeVisible()
  await trigger.click()
  const radio = page.getByRole('radio', { name: 'Filesystem' })
  await expect(radio).toBeVisible()
  await radio.click()
  await expect(radio).toHaveAttribute('aria-checked', 'true')
}

/** Stage firmware through Open file; the old session stays until layout choice. */
async function stageFileCandidate(page: Page): Promise<Locator> {
  const scoped = await openFilesystemActions(page)
  await scoped.getByRole('button', { name: 'Open file' }).click()
  await expect(
    scoped.getByRole('status').filter({ hasText: 'Staged firmware:' })
  ).toBeVisible()
  return scoped
}

/** Accept firmware through Open file + Open without layout (menu then closes). */
async function acceptFileWithoutLayout(page: Page): Promise<void> {
  const scoped = await stageFileCandidate(page)
  await scoped.getByRole('button', { name: 'Open without layout' }).click()
  await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
    /Filesystem file:/
  )
}

/** Accept firmware through Open folder + an explicit file choice. */
async function acceptFolderChoice(page: Page, name: string): Promise<void> {
  const scoped = await openFilesystemActions(page)
  await scoped.getByRole('button', { name: 'Open folder' }).click()
  await scoped.getByRole('option', { name, exact: true }).click()
  await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
    /Filesystem file:/
  )
}

async function readFilesystemRow(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(async () => {
    const open = indexedDB.open('keymap-editor-drafts')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    try {
      const rows = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const request = db.transaction('drafts', 'readonly').objectStore('drafts').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      // eslint-disable-next-line no-control-regex
      const isFilesystemRow = (id: unknown): boolean =>
        typeof id === 'string' && id.split('\0').slice(0, 2).join('\0') === '3\0filesystem'
      return rows.find(row => isFilesystemRow(row.id)) ?? null
    } finally {
      db.close()
    }
  })
}

test.describe('filesystem source (synthetic picker doubles)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('coachTourDone', '1')
    })
  })

  test('Open file stages firmware with optional layout, cancel and invalid input', async ({
    page
  }) => {
    await installFilesystemDoubles(page, {
      entries: {
        'a.keymap': { text: VALID_KEYMAP },
        'a.json': { text: VALID_LAYOUT }
      },
      fileQueue: [{ name: 'a.keymap' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)

    const staged = await stageFileCandidate(page)
    await expect(
      staged.getByRole('status').filter({ hasText: 'a.keymap' })
    ).toBeVisible()

    // Cancelled layout selection keeps the staged firmware and the old session.
    await fsPushFileQueue(page, [{ cancel: true }])
    await staged.getByRole('button', { name: 'Choose layout JSON' }).click()
    await expect(
      staged.getByRole('status').filter({ hasText: 'Staged firmware: a.keymap' })
    ).toBeVisible()
    await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
      'Open a .keymap from this computer (folder discovery is read-only)'
    )

    // Explicit layout selection accepts the same staged firmware.
    await fsPushFileQueue(page, [{ name: 'a.json' }])
    await staged.getByRole('button', { name: 'Choose layout JSON' }).click()
    await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
      /Filesystem file: a\.keymap/
    )

    // A new pick stages again rather than replacing the accepted session.
    await fsPushFileQueue(page, [{ name: 'a.keymap' }])
    const reopened = await openFilesystemActions(page)
    await reopened.getByRole('button', { name: 'Open file' }).click()
    await expect(
      reopened.getByRole('status').filter({ hasText: 'Staged firmware: a.keymap' })
    ).toBeVisible()
    await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
      /Filesystem file: a\.keymap/
    )
    await reopened.getByRole('button', { name: 'Cancel candidate' }).click()

    // Invalid firmware refuses acceptance and leaves the session intact.
    await fsSetDisk(page, 'a.keymap', '{"layers":[["&kp A"]]}')
    await fsPushFileQueue(page, [{ name: 'a.keymap' }])
    const retry = await openFilesystemActions(page)
    await retry.getByRole('button', { name: 'Open file' }).click()
    await expect(fsNotice(page)).toContainText(/not JSON|not a user|parsed|firmware/i)
    await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
      /Filesystem file: a\.keymap/
    )
    expect(await fsIo(page)).toEqual([])
  })

  test('picker cancellation and invalid selection preserve the session', async ({ page }) => {
    await installFilesystemDoubles(page, {
      entries: { 'notes.txt': { text: VALID_KEYMAP } },
      fileQueue: [{ cancel: true }, { name: 'notes.txt' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)

    const scoped = await openFilesystemActions(page)
    await scoped.getByRole('button', { name: 'Open file' }).click()
    await expect(
      picker(page).getByRole('button', { name: 'Open file' })
    ).toBeVisible()
    expect(await countOps(await fsLog(page), 'filePicked')).toBe(0)

    await scoped.getByRole('button', { name: 'Open file' }).click()
    await expect(fsNotice(page)).toContainText(/not a user|not a file|exactly one/i)
    expect(await countOps(await fsLog(page), 'read')).toBe(0)
    expect(await fsIo(page)).toEqual([])
  })

  test('Open folder lists direct keymaps deterministically and requires an explicit choice', async ({
    page
  }) => {
    await installFilesystemDoubles(page, {
      entries: {
        'B.keymap': { text: VALID_KEYMAP },
        'a.keymap': { text: VALID_KEYMAP },
        'ä.keymap': { text: VALID_KEYMAP },
        'info.json': { text: VALID_LAYOUT },
        'x.keymap.template': { text: VALID_KEYMAP }
      },
      dirs: {
        config: {
          children: ['ä.keymap', 'a.keymap', 'B.keymap', 'x.keymap.template', 'info.json', 'nested']
        }
      },
      dirQueue: [{ dir: 'config' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)

    const scoped = await openFilesystemActions(page)
    await scoped.getByRole('button', { name: 'Open folder' }).click()
    const options = scoped.getByRole('option')
    await expect(options).toHaveText(['B.keymap', 'a.keymap', 'ä.keymap'])
    await expect(scoped.getByText(/Ignored files/)).toContainText('info.json')
    await expect(scoped.getByText(/Ignored files/)).toContainText('x.keymap.template')
    await expect(page.locator('[aria-label="Filesystem firmware status"]')).toHaveCount(0)

    await scoped.getByRole('option', { name: 'a.keymap', exact: true }).click()
    await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
      /Filesystem file: a\.keymap/
    )
    const log = await fsLog(page)
    expect(log.filter(entry => entry.op === 'enumerate')).toHaveLength(1)
    expect(log.filter(entry => entry.op === 'read' && entry.child === true)).toHaveLength(1)
    expect(log.some(entry => entry.op === 'createWritable')).toBe(false)
    expect(await fsIo(page)).toEqual([])
  })

  test('folder-only browser stays read-only with explicit Clipboard guidance', async ({
    page
  }) => {
    await installFilesystemDoubles(page, {
      filePicker: false,
      entries: { 'a.keymap': { text: VALID_KEYMAP } },
      dirs: { config: { children: ['a.keymap'] } },
      dirQueue: [{ dir: 'config' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)

    const scoped = await openFilesystemActions(page)
    await expect(scoped.getByText(/Folder discovery stays read-only/)).toBeVisible()
    await expect(scoped.getByRole('button', { name: 'Open file' })).toBeDisabled()
    await scoped.getByRole('button', { name: 'Open folder' }).click()
    await scoped.getByRole('option', { name: 'a.keymap', exact: true }).click()
    await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
      /Filesystem file: a\.keymap/
    )
    const session = await openFilesystemActions(page)
    await expect(session.getByRole('button', { name: 'Save .keymap' })).toBeDisabled()
    await session.getByRole('button', { name: 'Use Clipboard' }).click()
    await expect(page.getByRole('radio', { name: 'Clipboard' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(await fsIo(page)).toEqual([])
  })

  test('verified Save requests permission through a fresh gesture and writes once', async ({
    page
  }) => {
    await installFilesystemDoubles(page, {
      entries: { 'a.keymap': { text: VALID_KEYMAP, query: 'prompt', grants: ['granted'] } },
      fileQueue: [{ name: 'a.keymap' }, { name: 'a.keymap' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)
    await acceptFileWithoutLayout(page)

    await expect(picker(page).getByText(/Firmware only/)).toContainText(
      'host files are not written'
    )
    await expect(page.locator('[aria-label="Filesystem firmware status"]')).toContainText(
      'host files not written'
    )

    await editKey(page, page.getByRole('button', { name: '&kp ESC, layer 0', exact: true }), 'F13')
    const saving = await openFilesystemActions(page)
    const save = saving.getByRole('button', { name: 'Save .keymap' })
    await expect(save).toBeEnabled()
    await save.click()
    await expect(fsNotice(page)).toContainText(/access action is required|explicit access/i)
    const grant = saving.getByRole('button', { name: 'Grant access' })
    await expect(grant).toBeVisible()
    await grant.click()

    await expect(fsNotice(page)).toContainText('Firmware saved; host files not written.')
    await expect(page.locator('.publish-status')).toContainText('Firmware saved')
    await expect(page.locator('[aria-label="Filesystem firmware status"]')).toContainText(
      'Firmware saved; host files not written'
    )
    expect(await fsDisk(page, 'a.keymap')).toContain('&kp F13')
    const log = await fsLog(page)
    expect(countOps(log, 'filePicker')).toBe(2)
    expect(countOps(log, 'requestPermission')).toBe(1)
    expect(countOps(log, 'write')).toBe(1)
    expect(countOps(log, 'close')).toBe(1)
    expect(log.filter(entry => entry.op === 'isSameEntry' && entry.result !== true).length).toBe(0)
    expect(await fsIo(page)).toEqual([])

    // A second Save needs its own fresh Save-access reselection.
    await closeMenu(page)
    await editKey(page, page.getByRole('button', { name: '&kp F13, layer 0', exact: true }), 'F14')
    await fsPushFileQueue(page, [{ name: 'a.keymap' }])
    const second = await openFilesystemActions(page)
    await second.getByRole('button', { name: 'Save .keymap' }).click()
    await expect(fsNotice(page)).toContainText('Firmware saved; host files not written.')
    expect(countOps(await fsLog(page), 'filePicker')).toBe(3)
    expect(await fsDisk(page, 'a.keymap')).toContain('&kp F14')
  })

  test('denied permission preserves the draft and never writes', async ({ page }) => {
    await installFilesystemDoubles(page, {
      entries: { 'a.keymap': { text: VALID_KEYMAP, query: 'prompt', grant: 'denied' } },
      fileQueue: [{ name: 'a.keymap' }, { name: 'a.keymap' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)
    await acceptFileWithoutLayout(page)

    await editKey(page, page.getByRole('button', { name: '&kp ESC, layer 0', exact: true }), 'F13')
    const saving = await openFilesystemActions(page)
    await saving.getByRole('button', { name: 'Save .keymap' }).click()
    await expect(fsNotice(page)).toContainText(/access action is required|explicit access/i)
    await saving.getByRole('button', { name: 'Grant access' }).click()
    await expect(fsNotice(page)).toContainText(/not granted|denied|draft.*unchanged/i)
    expect(await fsDisk(page, 'a.keymap')).not.toContain('&kp F13')
    const log = await fsLog(page)
    expect(countOps(log, 'requestPermission')).toBe(1)
    expect(countOps(log, 'write')).toBe(0)
    expect(countOps(log, 'close')).toBe(0)

    await closeMenu(page)
    await expect(page.getByRole('button', { name: '&kp F13, layer 0', exact: true })).toBeVisible()

    // Retrying must reselect the file; the retained denial cannot skip the picker.
    await fsPushFileQueue(page, [{ name: 'a.keymap' }])
    const retry = await openFilesystemActions(page)
    await retry.getByRole('button', { name: 'Save .keymap' }).click()
    expect(countOps(await fsLog(page), 'filePicker')).toBe(3)
    expect(await fsIo(page)).toEqual([])
  })

  test('directory Save proves the fresh pick and the current exact directory entry', async ({
    page
  }) => {
    await installFilesystemDoubles(page, {
      entries: { 'a.keymap': { text: VALID_KEYMAP } },
      dirs: { config: { children: ['a.keymap'] } },
      dirQueue: [{ dir: 'config' }],
      fileQueue: [{ name: 'a.keymap' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)
    await acceptFolderChoice(page, 'a.keymap')

    await editKey(page, page.getByRole('button', { name: '&kp ESC, layer 0', exact: true }), 'F13')
    const saving = await openFilesystemActions(page)
    await saving.getByRole('button', { name: 'Save .keymap' }).click()
    await expect(fsNotice(page)).toContainText('Firmware saved; host files not written.')
    const log = await fsLog(page)
    expect(log.filter(entry => entry.op === 'filePicker')).toHaveLength(1)
    expect(
      log.filter(entry => entry.op === 'resolve' && entry.name === 'a.keymap' && entry.create === false)
        .length
    ).toBeGreaterThanOrEqual(2)
    expect(log.filter(entry => entry.op === 'isSameEntry' && entry.result !== true).length).toBe(0)
    expect(log.some(entry => entry.op === 'createWritable' && entry.child === true)).toBe(false)
    expect(await fsDisk(page, 'a.keymap')).toContain('&kp F13')
    expect(await fsIo(page)).toEqual([])
  })

  test('wrong-file Save selection preserves the draft and writes nothing', async ({ page }) => {
    await installFilesystemDoubles(page, {
      entries: {
        'a.keymap': { text: VALID_KEYMAP },
        'b.keymap': { text: VALID_KEYMAP, id: 'other-entry' }
      },
      fileQueue: [{ name: 'a.keymap' }, { name: 'b.keymap' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)
    await acceptFileWithoutLayout(page)

    await editKey(page, page.getByRole('button', { name: '&kp ESC, layer 0', exact: true }), 'F13')
    const saving = await openFilesystemActions(page)
    await saving.getByRole('button', { name: 'Save .keymap' }).click()
    await expect(fsNotice(page)).toContainText(/not the accepted document|identity|conflict/i)
    expect(await fsDisk(page, 'a.keymap')).not.toContain('&kp F13')
    expect(await fsDisk(page, 'b.keymap')).not.toContain('&kp F13')
    expect(countOps(await fsLog(page), 'write')).toBe(0)

    await closeMenu(page)
    await expect(page.getByRole('button', { name: '&kp F13, layer 0', exact: true })).toBeVisible()
    expect(await fsIo(page)).toEqual([])
  })

  test('external mutation blocks Save with conflict guidance and zero writes', async ({
    page
  }) => {
    await installFilesystemDoubles(page, {
      entries: { 'a.keymap': { text: VALID_KEYMAP } },
      fileQueue: [{ name: 'a.keymap' }, { name: 'a.keymap' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)
    await acceptFileWithoutLayout(page)

    await editKey(page, page.getByRole('button', { name: '&kp ESC, layer 0', exact: true }), 'F13')
    await fsSetDisk(page, 'a.keymap', VALID_KEYMAP.replace('&kp A', '&kp B'))
    const saving = await openFilesystemActions(page)
    await saving.getByRole('button', { name: 'Save .keymap' }).click()
    await expect(fsNotice(page)).toContainText(/changed externally|conflict/i)
    const log = await fsLog(page)
    expect(countOps(log, 'write')).toBe(0)
    expect(countOps(log, 'createWritable')).toBe(0)

    await closeMenu(page)
    await expect(page.getByRole('button', { name: '&kp F13, layer 0', exact: true })).toBeVisible()
    expect(await readFilesystemRow(page)).not.toBeNull()
    expect(await fsIo(page)).toEqual([])
  })

  test('failed close keeps recovery and reaches Reconcile save without rewriting', async ({
    page
  }) => {
    await installFilesystemDoubles(page, {
      entries: { 'a.keymap': { text: VALID_KEYMAP } },
      fileQueue: [{ name: 'a.keymap' }, { name: 'a.keymap' }, { name: 'a.keymap' }],
      fail: { close: 'after-write' }
    })
    await page.goto('/')
    await openFilesystemSource(page)
    await acceptFileWithoutLayout(page)

    await editKey(page, page.getByRole('button', { name: '&kp ESC, layer 0', exact: true }), 'F13')
    const saving = await openFilesystemActions(page)
    await saving.getByRole('button', { name: 'Save .keymap' }).click()
    await expect(fsNotice(page)).toContainText(/Save not verified; file may have changed/)
    await expect(page.locator('.publish-status')).toContainText('Firmware recovery')
    await expect(page.locator('[aria-label="Filesystem firmware status"]')).toContainText(
      'host files not written'
    )
    expect(countOps(await fsLog(page), 'write')).toBe(1)

    // Ordinary Save stays blocked while the uncertain attempt is pending.
    await expect(saving.getByRole('button', { name: 'Save .keymap' })).toBeDisabled()
    await closeMenu(page)
    await editKey(page, page.getByRole('button', { name: '&kp F13, layer 0', exact: true }), 'F14')
    await expect(page.getByRole('button', { name: '&kp F13, layer 0', exact: true })).toBeVisible()
    await expect(page.locator('.save-notice[role="status"]:not([aria-label])')).toContainText('unresolved save attempt')
    await openFilesystemActions(page)
    await fsSetFail(page, null)
    const reconcile = saving.getByRole('button', { name: 'Reconcile save' })
    await expect(reconcile).toBeVisible()
    await reconcile.click()
    const confirm = picker(page).getByRole('alertdialog', { name: 'Reconcile confirmation' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Confirm reconcile from intended bytes' }).click()
    await expect(fsNotice(page)).toContainText(/reconciled|Firmware saved/i)
    expect(countOps(await fsLog(page), 'write')).toBe(1)
    expect(await fsIo(page)).toEqual([])
  })

  test('Restore draft never resolves a pending attempt; recovery survives reload', async ({
    page
  }) => {
    await installFilesystemDoubles(page, {
      entries: { 'a.keymap': { text: VALID_KEYMAP } },
      fileQueue: [{ name: 'a.keymap' }, { name: 'a.keymap' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)
    await acceptFileWithoutLayout(page)

    await editKey(page, page.getByRole('button', { name: '&kp ESC, layer 0', exact: true }), 'F13')
    await fsSetFail(page, { write: { name: 'IOError', message: 'disk vanished mid-write' } })
    const saving = await openFilesystemActions(page)
    await saving.getByRole('button', { name: 'Save .keymap' }).click()
    await expect(fsNotice(page)).toContainText(/Save not verified|Save stopped before writing/i)

    await saving.getByRole('button', { name: 'Restore draft' }).click()
    await expect(fsNotice(page)).toContainText(/does not resolve a retained attempt/i)
    await expect(saving.getByRole('button', { name: 'Reconcile save' })).toBeVisible()

    await closeMenu(page)
    await expect(page.getByRole('button', { name: '&kp F13, layer 0', exact: true })).toBeVisible()

    await page.reload()
    const row = await readFilesystemRow(page)
    expect(row).not.toBeNull()
    expect(JSON.stringify(row)).toContain('F13')
    expect(await fsLog(page)).toEqual([])
    await page.getByTestId('source-menu-trigger').click()
    await picker(page).getByRole('button', { name: 'Open recovery', exact: true }).click()
    await expect(page.locator('.source-popover')).toBeHidden()
    const recovered = await openFilesystemActions(page)
    await recovered.getByRole('button', { name: 'Restore draft', exact: true }).click()
    await expect(fsNotice(page)).toContainText('does not resolve a retained attempt')
    await expect(recovered.getByRole('textbox', { name: 'Firmware text' })).toHaveValue(/F13/)
    await recovered.getByRole('button', { name: 'Reconnect', exact: true }).click()
    await expect(fsNotice(page)).toContainText('no longer has a usable handle')
    expect(await readFilesystemRow(page)).toEqual(row)
    expect(countOps(await fsLog(page), 'read')).toBe(0)
    expect(countOps(await fsLog(page), 'write')).toBe(0)
    expect(await fsIo(page)).toEqual([])
  })

  test('clean open discloses firmware-only scope and Save stays disabled without firmware edits', async ({
    page
  }) => {
    await installFilesystemDoubles(page, {
      entries: { 'a.keymap': { text: VALID_KEYMAP } },
      fileQueue: [{ name: 'a.keymap' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)
    await acceptFileWithoutLayout(page)

    const scoped = await openFilesystemActions(page)
    await expect(page.getByRole('button', { name: '&kp ESC, layer 0', exact: true })).toBeVisible()
    await expect(scoped.getByRole('button', { name: 'Save .keymap' })).toBeDisabled()
    await expect(page.locator('[aria-label="Filesystem firmware status"]')).toContainText(
      'host files not written'
    )
    await expect(page.locator('.publish-status')).toContainText('Firmware loaded')
    expect(await fsIo(page)).toEqual([])
  })

  test('status layout keeps the firmware status and Discard control disjoint', async ({
    page
  }) => {
    await installFilesystemDoubles(page, {
      entries: { 'a.keymap': { text: VALID_KEYMAP } },
      fileQueue: [{ name: 'a.keymap' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)
    await acceptFileWithoutLayout(page)

    await editKey(page, page.getByRole('button', { name: '&kp ESC, layer 0', exact: true }), 'F13')
    const status = page.locator('.publish-status')
    const discard = page.getByRole('button', { name: 'Discard firmware draft' })
    await expect(status).toBeVisible()
    await expect(discard).toBeEnabled()
    expect(await status.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    const statusBox = await status.boundingBox()
    const discardBox = await discard.boundingBox()
    expect(statusBox).not.toBeNull()
    expect(discardBox).not.toBeNull()
    const overlaps =
      statusBox!.x < discardBox!.x + discardBox!.width &&
      discardBox!.x < statusBox!.x + statusBox!.width &&
      statusBox!.y < discardBox!.y + discardBox!.height &&
      discardBox!.y < statusBox!.y + statusBox!.height
    expect(overlaps).toBe(false)
  })

  test('confirmed discard-and-reload adopts validated disk inputs without writing', async ({
    page
  }) => {
    await installFilesystemDoubles(page, {
      entries: { 'a.keymap': { text: VALID_KEYMAP } },
      fileQueue: [{ name: 'a.keymap' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)
    await acceptFileWithoutLayout(page)

    await editKey(page, page.getByRole('button', { name: '&kp ESC, layer 0', exact: true }), 'F13')
    await fsSetDisk(page, 'a.keymap', VALID_KEYMAP.replace('&kp A', '&kp B'))
    const scoped = await openFilesystemActions(page)
    page.once('dialog', dialog => dialog.dismiss())
    await scoped.getByRole('button', { name: 'Discard firmware draft and reload' }).click()
    expect(countOps(await fsLog(page), 'filePicker')).toBe(1)
    await fsPushFileQueue(page, [{ name: 'a.keymap' }])
    page.once('dialog', dialog => dialog.accept())
    await scoped.getByRole('button', { name: 'Discard firmware draft and reload' }).click()
    await expect(fsNotice(page)).toContainText('Firmware baseline reloaded')
    expect(await fsDisk(page, 'a.keymap')).toContain('&kp B')
    const row = await readFilesystemRow(page)
    expect(JSON.stringify(row)).toContain('&kp B')
    expect(JSON.stringify(row)).not.toContain('F13')
    expect(countOps(await fsLog(page), 'write')).toBe(0)
    await closeMenu(page)
    await expect(page.getByRole('button', { name: '&kp ESC, layer 0', exact: true })).toBeVisible()
    expect(await fsIo(page)).toEqual([])
  })

  test('empty-folder cancellation preserves the accepted draft and restores route controls', async ({ page }) => {
    await installFilesystemDoubles(page, {
      entries: { 'a.keymap': { text: VALID_KEYMAP } },
      fileQueue: [{ name: 'a.keymap' }], dirs: { empty: { children: [] } }, dirQueue: [{ dir: 'empty' }]
    })
    await page.goto('/')
    await openFilesystemSource(page)
    await acceptFileWithoutLayout(page)
    await editKey(page, page.getByRole('button', { name: '&kp ESC, layer 0', exact: true }), 'F13')
    const scoped = await openFilesystemActions(page)
    await scoped.getByRole('button', { name: 'Open folder', exact: true }).click()
    await expect(scoped.getByText('No eligible .keymap files in this folder. The current session is unchanged.')).toBeVisible()
    await scoped.getByRole('button', { name: 'Cancel folder', exact: true }).click()
    await expect(scoped.getByRole('button', { name: 'Open file', exact: true })).toBeEnabled()
    await expect(scoped.getByRole('button', { name: 'Open folder', exact: true })).toBeEnabled()
    await closeMenu(page)
    await expect(page.getByRole('button', { name: '&kp F13, layer 0', exact: true })).toBeVisible()
    expect(countOps(await fsLog(page), 'write')).toBe(0)
    expect(await fsDisk(page, 'a.keymap')).toBe(VALID_KEYMAP)
  })
})
