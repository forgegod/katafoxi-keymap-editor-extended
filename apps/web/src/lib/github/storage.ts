import { isRepositoryKeymapPath, type RepositoryKeymapSelection } from '@keymap-editor/keymap-core'

const REPOSITORY = 'selectedGithubRepository'
const BRANCH = 'selectedGithubBranch'

export function getPersistedRepository(): number | null {
  try {
    return JSON.parse(localStorage.getItem(REPOSITORY) || 'null')
  } catch {
    return null
  }
}

export function setPersistedRepository(repository: number | string) {
  try {
    localStorage.setItem(REPOSITORY, JSON.stringify(repository))
  } catch {
    /* private mode / quota — ignore */
  }
}

export function getPersistedBranch(repoId: number | string): string | null {
  try {
    return JSON.parse(localStorage.getItem(`${BRANCH}:${repoId}`) || 'null')
  } catch {
    return null
  }
}

export function setPersistedBranch(repoId: number | string, branch: string) {
  try {
    localStorage.setItem(`${BRANCH}:${repoId}`, JSON.stringify(branch))
  } catch {
    /* private mode / quota — ignore */
  }
}

function fileKey(repository: string, branch: string) {
  return `selectedGithubKeymap:${JSON.stringify([repository, branch])}`
}

export function getPersistedKeymap(repository: string, branch: string): RepositoryKeymapSelection | null {
  try {
    const value = JSON.parse(localStorage.getItem(fileKey(repository, branch)) || 'null')
    if (!value || !isRepositoryKeymapPath(value.keymapPath)) return null
    return { keymapPath: value.keymapPath, ...(value.expectedMode === 'scoped' || value.expectedMode === 'legacy' ? { expectedMode: value.expectedMode } : {}) }
  } catch {
    return null
  }
}

export function setPersistedKeymap(repository: string, branch: string, selection: RepositoryKeymapSelection) {
  try {
    localStorage.setItem(fileKey(repository, branch), JSON.stringify(selection))
  } catch {
    /* private mode / quota — do not undo an accepted live selection */
  }
}
