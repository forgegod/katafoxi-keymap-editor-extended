/**
 * Preferred XKB symbols module / variant when pasting a custom host layout
 * into an existing system file (Linux install dialog).
 *
 * English prefers the short `au` module over the huge `us` tree; Russian
 * prefers the nearly empty `legacy` section at the top of `symbols/ru`.
 */

import { hostLanguage, type HostLanguageId } from './host-languages.js'

export type XkbInstallTarget = {
  module: string
  systemPath: string
  userPath: string
  /** Layout-picker label when a named section is preferred (`legacy`, Australia). */
  variant: string | null
  /** Short tip for the install card; null when the default module is fine. */
  tip: string | null
}

function pathsFor(module: string): Pick<XkbInstallTarget, 'systemPath' | 'userPath'> {
  return {
    systemPath: `/usr/share/X11/xkb/symbols/${module}`,
    userPath: `~/.xkb/symbols/${module}`
  }
}

/**
 * Recommended symbols file and variant for installing a custom host layout.
 * Components only render the returned paths and tip.
 */
export function recommendedXkbInstallTarget(language: HostLanguageId): XkbInstallTarget {
  if (language === 'en') {
    return {
      module: 'au',
      ...pathsFor('au'),
      variant: 'Australia (au)',
      tip: 'Prefer symbols/au (Australia), not us: the file is short and near the top of the symbols list, there is less layout-picker clutter across distros, and the Australian flag makes it obvious you are on your custom layout.'
    }
  }
  if (language === 'ru') {
    return {
      module: 'ru',
      ...pathsFor('ru'),
      variant: 'legacy',
      tip: 'Prefer the legacy section at the top of symbols/ru — it is nearly empty and easy to select in the layout list.'
    }
  }
  const module = hostLanguage(language).xkbModule
  return {
    module,
    ...pathsFor(module),
    variant: null,
    tip: null
  }
}
