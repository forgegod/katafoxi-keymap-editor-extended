/**
 * OS install deliverables written beside `host_keymap/snapshot.json` on GitHub Commit.
 * Snapshot remains editor SoT; these files are for download after an OS reinstall.
 * @see docs/adr/0005-host-keymap-github-snapshot.md
 */

import {
  hostLanguage,
  windowsCapsPairingRecommended,
  type HostLanguageId
} from './host-languages.js'
import type { HostLayout } from './host-layout.js'
import { hostLayoutToKlc, hostLayoutsToCapsKlc, pairedKbdId } from './klc-write.js'
import { windowsLocale } from './klc-locale.js'
import { hostLayoutToXkbSection } from './xkb-write.js'
import type { HostLegendView } from './types.js'

export const HOST_KEYMAP_DIR = 'host_keymap'

export type HostKeymapDeliverableFile = {
  /** Path from the repository root (e.g. `host_keymap/linux/ru.xkb`). */
  path: string
  /** UTF-8 text (xkb section or CRLF `.klc` source before UTF-16 packaging). */
  content: string
}

export type HostKeymapDeliverableLayout = {
  id: string
  name: string
  language: HostLanguageId
  layout: HostLayout
  /** User layouts get per-language Linux/Windows files. */
  user: boolean
}

/**
 * Build Linux xkb sections and Windows `.klc` sources for the live legend.
 * One language → one `linux/<lang>.xkb` and `windows/<lang>.klc` when that
 * column is a user layout. When English and another language are both on the
 * board, also write `windows/en-<lang>.klc` (English letters + Caps Lock).
 */
export function buildHostKeymapDeliverableFiles(
  view: HostLegendView,
  layoutsById: ReadonlyMap<string, HostKeymapDeliverableLayout>
): HostKeymapDeliverableFile[] {
  const files: HostKeymapDeliverableFile[] = []
  const seenPaths = new Set<string>()

  const push = (path: string, content: string) => {
    if (seenPaths.has(path)) return
    seenPaths.add(path)
    files.push({ path, content })
  }

  for (const column of view.columns) {
    const record = layoutsById.get(column.layoutId)
    if (!record?.user) continue
    const stem = column.language
    push(
      `${HOST_KEYMAP_DIR}/linux/${stem}.xkb`,
      hostLayoutToXkbSection(record.layout, {
        section: record.name,
        name: record.name
      })
    )
    push(
      `${HOST_KEYMAP_DIR}/windows/${stem}.klc`,
      hostLayoutToKlc(record.layout, {
        name: record.name,
        locale: windowsLocale(record.language)
      })
    )
  }

  const enColumn = view.columns.find(column => column.language === 'en')
  const enRecord = enColumn ? layoutsById.get(enColumn.layoutId) : undefined
  if (enRecord) {
    const baseName = hostLanguage('en').name
    for (const column of view.columns) {
      if (column.language === 'en') continue
      if (!windowsCapsPairingRecommended(column.language)) continue
      const capsRecord = layoutsById.get(column.layoutId)
      if (!capsRecord) continue
      const capsName = hostLanguage(column.language).name
      const kbdId = pairedKbdId(baseName, capsName, 1)
      push(
        `${HOST_KEYMAP_DIR}/windows/en-${column.language}.klc`,
        hostLayoutsToCapsKlc(enRecord.layout, capsRecord.layout, {
          name: `${baseName} + ${capsName}`,
          kbdId,
          locale: windowsLocale('en')
        })
      )
    }
  }

  return files
}
