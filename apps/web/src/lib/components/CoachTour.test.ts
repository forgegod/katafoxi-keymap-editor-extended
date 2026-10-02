import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CoachTour from './CoachTour.svelte'
import { COACH_TOUR_STORAGE_KEY } from '../coach-tour'

describe('CoachTour', () => {
  let target: HTMLDivElement
  let modalRoot: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined
  let fixtures: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    target = document.createElement('div')
    document.body.appendChild(target)
    modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    document.body.appendChild(modalRoot)

    fixtures = document.createElement('div')
    fixtures.innerHTML = `
      <div class="board-stack">
        <div class="key" data-editable="true" data-tour="legend-key" style="width:40px;height:40px"></div>
      </div>
      <div class="chrome-source"><div class="source-menu"></div></div>
      <div data-tour="legend-main" style="width:120px;height:40px"></div>
      <button type="button" data-tour="layer-eye">layer</button>
      <button type="button" data-tour="language-eye">lang</button>
    `
    document.body.appendChild(fixtures)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target.remove()
    modalRoot.remove()
    fixtures.remove()
    localStorage.clear()
  })

  async function open(props: Record<string, unknown> = {}) {
    view = mount(CoachTour, {
      target,
      props: {
        showGithub: true,
        expandLegend: false,
        onPasteKeymap: vi.fn(),
        onConnectGithub: vi.fn(),
        ...props
      }
    })
    flushSync()
    await tick()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    flushSync()
  }

  function dialog() {
    return document.querySelector('[role="dialog"][aria-labelledby="coach-tour-title"]')
  }

  it('starts on the first step and can skip', async () => {
    await open()
    expect(dialog()?.textContent).toMatch(/Edit a key/)
    expect(dialog()?.textContent).toMatch(/1 \/ 6/)

    const skip = [...document.querySelectorAll('button')].find(btn =>
      btn.textContent?.includes('Skip')
    )
    skip?.click()
    flushSync()

    expect(dialog()).toBeNull()
    expect(localStorage.getItem(COACH_TOUR_STORAGE_KEY)).toBe('1')
  })

  it('walks through layer and language steps', async () => {
    await open()

    const titles = [
      'Edit a key',
      'Edit what the OS types',
      'Layers and languages',
      'Show or hide a layer',
      'Show or hide a language',
      'Bring your own keymap'
    ]

    for (let i = 0; i < titles.length; i++) {
      expect(dialog()?.textContent).toContain(titles[i])
      if (i === titles.length - 1) break
      const next = [...document.querySelectorAll('button')].find(btn =>
        btn.textContent?.trim() === 'Next'
      )
      next?.click()
      flushSync()
      await tick()
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      flushSync()
    }
  })

  it('stays hidden after a prior finish', async () => {
    localStorage.setItem(COACH_TOUR_STORAGE_KEY, '1')
    await open()
    expect(dialog()).toBeNull()
  })

  it('finishes with Paste .keymap CTA', async () => {
    const onPasteKeymap = vi.fn()
    await open({ onPasteKeymap })

    for (let i = 0; i < 5; i++) {
      const next = [...document.querySelectorAll('button')].find(btn =>
        btn.textContent?.trim() === 'Next'
      )
      next?.click()
      flushSync()
      await tick()
    }

    expect(dialog()?.textContent).toMatch(/Bring your own keymap/)
    expect(
      [...document.querySelectorAll('button')].some(btn =>
        btn.textContent?.includes('Skip')
      )
    ).toBe(false)
    expect(dialog()?.querySelector('.coach-cta-row')).toBeTruthy()

    const paste = [...document.querySelectorAll('button')].find(btn =>
      btn.textContent?.includes('Paste .keymap')
    )
    paste?.click()
    flushSync()

    expect(onPasteKeymap).toHaveBeenCalled()
    expect(localStorage.getItem(COACH_TOUR_STORAGE_KEY)).toBe('1')
    expect(dialog()).toBeNull()
  })

  it('reopens from step 1 when restartKey increments', async () => {
    localStorage.setItem(COACH_TOUR_STORAGE_KEY, '1')
    await open({ restartKey: 0 })
    expect(dialog()).toBeNull()

    if (view) unmount(view)
    view = mount(CoachTour, {
      target,
      props: {
        showGithub: true,
        expandLegend: false,
        restartKey: 1,
        onPasteKeymap: vi.fn(),
        onConnectGithub: vi.fn()
      }
    })
    flushSync()
    await tick()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    flushSync()

    expect(dialog()?.textContent).toMatch(/Edit a key/)
    expect(localStorage.getItem(COACH_TOUR_STORAGE_KEY)).toBeNull()
  })
})
