import { isUserKeymapFilename } from './keymap.js'
import { hostLayoutChoices } from './host-layout-catalog.js'
import type { HostKeymapSnapshot } from './host-keymap-snapshot.js'

/** A browser-global user registry must never supply missing repository tables. */
export function isOwnedHostSnapshotCompatible(snapshot: HostKeymapSnapshot): boolean {
  return snapshot.view.columns.every(column => {
    const layout = column.layoutId.startsWith('user:')
      ? snapshot.layouts.find(layout => layout.id === column.layoutId)
      : hostLayoutChoices.find(layout => layout.id === column.layoutId)
    return layout?.language === column.language
  })
}

/** Exact repository identity: never normalize or decode before testing. */
export function isRepositoryKeymapPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('config/')) return false
  const name = value.slice('config/'.length)
  return name.length > '.keymap'.length && !name.startsWith('.') &&
    !/[/%\\\x00-\x1f\x7f]/.test(name) && isUserKeymapFilename(name)
}

export type RepositoryKeymapMode = 'legacy' | 'scoped' | 'scoped-new'
export type RepositoryJsonChoice = {
  repository: string
  branch: string
  keymapPath: string
  headSha: string
  input: 'legacy' | 'dts'
}
export type RepositoryKeymapSelection = {
  keymapPath?: string
  expectedMode?: RepositoryKeymapMode
  jsonChoice?: RepositoryJsonChoice
  jsonSource?: 'legacy' | 'dts'
}
export const REPOSITORY_KEYMAP_MODE_PATH = 'config/.keymap-editor.json'
export const REPOSITORY_KEYMAP_MODE_CONTENT = '{"version":1,"mode":"scoped"}\n'

export function repositoryKeymapPaths(keymapPath: string, mode: RepositoryKeymapMode) {
  if (!isRepositoryKeymapPath(keymapPath)) throw new Error('Invalid selected keymap path')
  const filename = keymapPath.slice('config/'.length)
  const hostRoot = mode === 'legacy' ? 'host_keymap/' : `host_keymap/keymaps/${filename}/`
  return {
    firmwareJson: mode === 'legacy' ? 'config/keymap.json' : `${keymapPath}.json`,
    template: `${keymapPath}.template`,
    hostRoot,
    snapshot: `${hostRoot}snapshot.json`
  }
}
