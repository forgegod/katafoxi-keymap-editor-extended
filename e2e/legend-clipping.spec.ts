import { expect, test, type Locator } from '@playwright/test'

/** Check painted text as well as boxes, before Playwright can auto-scroll a click. */
async function expectReachable(control: Locator, hasText = true) {
  await expect(control).toBeVisible()
  const measure = () => control.evaluate(element => {
    const box = (rect: DOMRect) => ({
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom
    })
    type Box = ReturnType<typeof box>
    const contains = (outer: Box, inner: Box, axis: 'x' | 'y') => axis === 'x'
      ? inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5
      : inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5
    const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
    const border = box(element.getBoundingClientRect())
    const text: Box[] = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.textContent ?? ''
      if (!value.trim()) continue
      const range = document.createRange()
      range.setStart(node, value.length - value.trimStart().length)
      range.setEnd(node, value.trimEnd().length)
      text.push(...Array.from(range.getClientRects(), box))
    }
    const issues: string[] = []
    const scrollers: string[] = []
    const painted = [border, ...text]
    for (const axis of ['x', 'y'] as const) {
      if (!painted.every(rect => contains(viewport, rect, axis))) issues.push(`viewport ${axis}`)
      if (!text.every(rect => contains(border, rect, axis))) issues.push(`text outside control ${axis}`)
    }
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor)
      const rect = ancestor.getBoundingClientRect()
      const port = {
        left: rect.left + ancestor.clientLeft, top: rect.top + ancestor.clientTop,
        right: rect.left + ancestor.clientLeft + ancestor.clientWidth,
        bottom: rect.top + ancestor.clientTop + ancestor.clientHeight
      }
      const name = `${ancestor.tagName}.${ancestor.className}`

      for (const axis of ['x', 'y'] as const) {
        const overflow = axis === 'x' ? style.overflowX : style.overflowY
        const canScroll = axis === 'x'
          ? ancestor.scrollWidth > ancestor.clientWidth
          : ancestor.scrollHeight > ancestor.clientHeight
        if (/^(auto|scroll)$/.test(overflow) && canScroll &&
          contains(viewport, port, 'x') && contains(viewport, port, 'y')) {
          scrollers.push(`${name} ${axis}`)
        }
        if (/^(hidden|clip|auto|scroll)$/.test(overflow) &&
          !painted.every(bounds => contains(port, bounds, axis))) issues.push(`${name} clips ${axis}`)
      }
      // Chromium reports no offsetParent for viewport-fixed menus. Their own
      // scrollport clips items, but outer DOM ancestors do not; the viewport
      // checks above still apply. A transformed containing block is not exempt.
      if (style.position === 'fixed' && ancestor.offsetParent === null) break
    }
    return { border, text, issues, scrollers }
  })

  const before = await measure()
  if (hasText) expect(before.text.length, 'control has measurable text').toBeGreaterThan(0)
  if (before.issues.length) {
    expect(before.scrollers.length, `No viewport-contained auto/scroll ancestor: ${JSON.stringify(before)}`)
      .toBeGreaterThan(0)
  }
  await control.evaluate(element => element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }))
  await expect.poll(async () => (await measure()).issues, `Full box/text must be exposed: ${JSON.stringify(before)}`)
    .toEqual([])
  await expect.poll(() => control.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
  }), 'Exposed control must be painted and hit-testable').toBe(true)
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 360, height: 640 }, { width: 1280, height: 720 }]) {
    test(`Demo Corne legend controls are reachable · ${theme} ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
      await page.setViewportSize(viewport)
      await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
      await page.goto('/')
      await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName('Demo keyboard: Corne')
      if (theme === 'light') await page.getByRole('button', { name: 'Color theme: Dark' }).click()
      await expect(page.locator('html')).toHaveAttribute('data-color-scheme', theme)
      await page.evaluate(() => document.fonts.ready)
      const legend = page.getByRole('region', { name: 'Host legend', exact: true })
      const controls = ['AltGr', 'AltGr+Shift', 'Computer language'].map(name =>
        legend.getByRole('button', { name, exact: true }))

      await page.mouse.move(0, 0)
      await page.screenshot({ path: info.outputPath('legend-resting.png') })
      for (const control of controls) await expectReachable(control)
      await page.screenshot({ path: info.outputPath('legend-scrolled.png') })

      // Focus expands the same table; toggles must remain reachable and reversible.
      for (const control of controls.slice(0, 2)) {
        const pressed = await control.getAttribute('aria-pressed')
        await control.focus()
        await expectReachable(control)
        await control.click()
        await expect(control).toHaveAttribute('aria-pressed', String(pressed !== 'true'))
        await control.press('Space')
        await expect(control).toHaveAttribute('aria-pressed', pressed!)
      }
      await controls[2].focus()
      await expectReachable(controls[2])
      await expect(controls[2]).toBeEnabled()
      await expect(controls[2]).toBeFocused()
      // Open-menu coverage below uses a second host language.
      await expect(controls[2]).toHaveAttribute('aria-expanded', 'false')
      const alignment = await legend.locator('table').evaluate(table => {
        const headers = Array.from(table.querySelectorAll('thead th'), cell => cell.getBoundingClientRect())
        return Array.from(table.querySelectorAll('tbody tr'), row =>
          Array.from(row.children).every((cell, index) => {
            const rect = cell.getBoundingClientRect()
            return Math.abs(rect.left - headers[index].left) < 1 && Math.abs(rect.right - headers[index].right) < 1
          }))
      })
      expect(alignment.length).toBeGreaterThan(1)
      expect(alignment.every(Boolean)).toBe(true)
      await page.screenshot({ path: info.outputPath('legend-expanded.png') })
    })

    test(`second-language legend menus are reachable · ${theme} ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
      await page.setViewportSize(viewport)
      await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
      await page.goto('/')
      await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName('Demo keyboard: Corne')
      if (theme === 'light') await page.getByRole('button', { name: 'Color theme: Dark' }).click()
      await expect(page.locator('html')).toHaveAttribute('data-color-scheme', theme)
      await page.evaluate(() => document.fonts.ready)
      const legend = page.getByRole('region', { name: 'Host legend', exact: true })
      await legend.getByRole('button', { name: 'Computer language', exact: true }).click()
      await legend.getByRole('option', { name: 'German', exact: true }).click()
      const profile = legend.getByRole('button', { name: /^Profile German:/ })
      await expect(profile).toHaveAccessibleName('Profile German: System')
      await expect(legend.getByRole('button', { name: /^Profile / })).toHaveCount(2)
      await expectReachable(profile)
      await profile.click()
      const menu = legend.getByRole('menu', { name: 'Profile German', exact: true })
      await expect(menu).toBeVisible()
      await page.screenshot({ path: info.outputPath('legend-profile-open.png') })
      const items = menu.getByRole('menuitem')
      await expect(items).toHaveCount(46) // 22 system profiles, their Copy actions and two imports.
      for (const item of await items.all()) {
        // Copy actions paint an SVG rather than a text node; still check their full boxes.
        await expectReachable(item, !(await item.getAttribute('aria-label'))?.startsWith('Copy '))
      }
      await page.screenshot({ path: info.outputPath('legend-profile-scrolled.png') })
      const lastProfile = menu.getByRole('menuitem', { name: 'noted', exact: true })
      await expectReachable(lastProfile)
      await lastProfile.click()
      await expect(menu).toHaveCount(0)
      await expect(profile).toHaveAccessibleName('Profile German: noted')
      await profile.press('Enter')
      await expect(menu.getByRole('menuitem', { name: 'noted', exact: true })).toHaveAttribute('aria-current', 'true')
      await expectReachable(menu.getByRole('menuitem', { name: 'System', exact: true }))
      await menu.getByRole('menuitem', { name: 'System', exact: true }).press('Enter')
      await expect(profile).toHaveAccessibleName('Profile German: System')
      await profile.click()
      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
      await expect(profile).toBeFocused()

      // The far-right Add language trigger moves further out once German is present.
      const add = legend.getByRole('button', { name: 'Add language', exact: true })
      await expectReachable(add)
      await add.click()
      const languages = legend.getByRole('listbox', { name: 'Language', exact: true })
      await expect(languages.getByRole('option')).toHaveCount(18)
      await expect(languages.getByRole('option', { name: 'Bulgarian', exact: true })).toBeFocused()
      await page.screenshot({ path: info.outputPath('legend-add-language-open.png') })
      for (const option of await languages.getByRole('option').all()) await expectReachable(option)
      await page.screenshot({ path: info.outputPath('legend-add-language-scrolled.png') })
      await page.keyboard.press('Escape')
      await expect(languages).toHaveCount(0)
      await expect(add).toHaveAttribute('aria-expanded', 'false')

      const language = legend.getByRole('button', { name: 'Language German', exact: true })
      await expectReachable(language, false)
      await language.click()
      await expect(languages.getByRole('option')).toHaveCount(20)
      const selected = languages.getByRole('option', { name: 'German', exact: true })
      await expect(selected).toBeDisabled()
      await expect(selected).toHaveAttribute('aria-selected', 'true')
      await expect(languages.getByRole('option', { name: 'Bulgarian', exact: true })).toBeFocused()
      await page.screenshot({ path: info.outputPath('legend-language-open.png') })
      for (const option of await languages.getByRole('option').all()) await expectReachable(option)
      await page.screenshot({ path: info.outputPath('legend-language-scrolled.png') })
      await page.mouse.click(0, 0)
      await expect(languages).toHaveCount(0)
      await expect(profile).toHaveAccessibleName('Profile German: System')
      await language.click()
      const remove = languages.getByRole('option', { name: 'Remove language', exact: true })
      await expectReachable(remove)
      await remove.click()
      await expect(languages).toHaveCount(0)
      await expect(profile).toHaveCount(0)
      await expect(legend.getByRole('button', { name: 'Profile English: System', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    })

    test(`layer delete confirmation escapes the legend scroller · ${theme} ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
      await page.setViewportSize(viewport)
      await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
      await page.goto('/')
      await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName('Demo keyboard: Corne')
      if (theme === 'light') await page.getByRole('button', { name: 'Color theme: Dark' }).click()
      const legend = page.getByRole('region', { name: 'Host legend', exact: true })
      await legend.getByRole('button', { name: 'AltGr', exact: true }).focus()
      const remove = legend.getByRole('button', { name: /^Delete layer / }).last()
      await remove.click()
      const confirmation = page.getByRole('alertdialog', { name: 'Delete layer', exact: true })
      const confirm = confirmation.getByRole('button', { name: 'Delete', exact: true })
      await expect(confirm).toBeFocused()
      // Measure before scrolling or focusing the confirmation can hide the regression.
      const painted = await confirm.evaluate(button => {
        const rect = button.getBoundingClientRect()
        return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
      })
      expect(painted, 'auto-focused Delete must be painted, not clipped below the scrollport').toBe(true)
      await expectReachable(confirm)
      await expectReachable(confirmation.getByRole('button', { name: 'Cancel', exact: true }))
      await page.screenshot({ path: info.outputPath('legend-delete-confirmation.png') })
      await page.keyboard.press('Escape')
      await expect(confirmation).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    })
  }
}
