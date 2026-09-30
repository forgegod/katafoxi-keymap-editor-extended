export type GithubGate = 'login' | 'install'

const KEYBOARD_PREFIX = 'zmk-keyboard-'

/** Repo name, without `owner/`. */
export function repoName(fullName: string): string {
  const slash = fullName.lastIndexOf('/')
  return slash === -1 ? fullName : fullName.slice(slash + 1)
}

/**
 * Closed-chrome label. `zmk-keyboard-lark` shows `lark`.
 * `zmk-config` stays whole. A short label shared by two repos falls back to `owner/name`.
 */
export function repoChoiceLabel(fullName: string, fullNames: string[]): string {
  const names = (fullNames.length > 0 ? fullNames : [fullName]).map(repoName)
  const shorts = names.map(shortRepoName)
  const mine = shortRepoName(repoName(fullName))
  const shared = shorts.filter(label => label === mine).length > 1
  return shared ? fullName : mine
}

export function shortRepoName(name: string): string {
  if (name.startsWith(KEYBOARD_PREFIX) && name.length > KEYBOARD_PREFIX.length) {
    return name.slice(KEYBOARD_PREFIX.length)
  }
  return name
}

export function githubChipLabel(
  fullName: string | null,
  fullNames: string[],
  branch: string | null
): string {
  if (!fullName) return 'GitHub'
  const label = repoChoiceLabel(fullName, fullNames)
  return branch ? `${label} · ${branch}` : label
}

/**
 * Login / install replaces the menu only when GitHub is the only source.
 * With Local beside it, those actions stay inside the menu so the source can still change.
 */
export function githubGateAction(input: {
  onlySource: boolean
  ready: boolean
  authorized: boolean
  appInstalled: boolean
}): GithubGate | null {
  if (!input.onlySource || !input.ready) return null
  if (!input.authorized) return 'login'
  if (!input.appInstalled) return 'install'
  return null
}
