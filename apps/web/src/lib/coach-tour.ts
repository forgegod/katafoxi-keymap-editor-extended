/** First-visit coach tour (demo only). English UI copy. */

export const COACH_TOUR_STORAGE_KEY = 'coachTourDone'

export type CoachTourStepId =
  | 'click-key'
  | 'alt-click'
  | 'legend'
  | 'layer-eye'
  | 'language-eye'
  | 'bring-own'

export type CoachTourStep = {
  id: CoachTourStepId
  title: string
  body: string
  /** CSS selector under #app-root / document. */
  selector: string
  /** Expand the host-legend strip so layer rows and eyes are visible. */
  expandLegend?: boolean
  /** Last step shows Paste / GitHub actions instead of Next. */
  finish?: boolean
}

export const COACH_TOUR_STEPS: CoachTourStep[] = [
  {
    id: 'click-key',
    title: 'Edit a key',
    body: 'Click the sample key — the same glyphs appear in the layer table above. Change what the firmware sends (ZMK binding).',
    selector: '[data-tour="legend-key"]'
  },
  {
    id: 'alt-click',
    title: 'Edit what the OS types',
    body: 'Alt+click this same key to change the host legend — the character your computer types for that code.',
    selector: '[data-tour="legend-key"]'
  },
  {
    id: 'legend',
    title: 'Layers and languages',
    body: 'This strip is the host legend: ZMK layers down the side, computer languages across the top. The sample column matches the key highlighted earlier. After the tour, hover the strip to expand every layer.',
    selector: '[data-tour="legend-main"]',
    expandLegend: true
  },
  {
    id: 'layer-eye',
    title: 'Show or hide a layer',
    body: 'Use the eye next to a layer name to show or hide that layer on the keys. Layer 0 can switch between host glyphs and raw ZMK codes.',
    selector: '[data-tour="layer-eye"]',
    expandLegend: true
  },
  {
    id: 'language-eye',
    title: 'Show or hide a language',
    body: 'Use the eye next to a language flag to show or hide that language on the keys. Add another language with + Language.',
    selector: '[data-tour="language-eye"]',
    expandLegend: true
  },
  {
    id: 'bring-own',
    title: 'Bring your own keymap',
    body: 'Demo edits stay in this browser. Paste a .keymap from your firmware repo, or connect GitHub to commit.',
    selector: '.chrome-source .source-menu, .chrome-source',
    finish: true
  }
]

export function readCoachTourDone(): boolean {
  try {
    return localStorage.getItem(COACH_TOUR_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeCoachTourDone() {
  try {
    localStorage.setItem(COACH_TOUR_STORAGE_KEY, '1')
  } catch {
    /* private mode */
  }
}

export function clearCoachTourDone() {
  try {
    localStorage.removeItem(COACH_TOUR_STORAGE_KEY)
  } catch {
    /* private mode */
  }
}
