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
  localStorage.setItem(REPOSITORY, JSON.stringify(repository))
}

export function getPersistedBranch(repoId: number | string): string | null {
  try {
    return JSON.parse(localStorage.getItem(`${BRANCH}:${repoId}`) || 'null')
  } catch {
    return null
  }
}

export function setPersistedBranch(repoId: number | string, branch: string) {
  localStorage.setItem(`${BRANCH}:${repoId}`, JSON.stringify(branch))
}
