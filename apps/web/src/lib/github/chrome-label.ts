export type GithubGate = 'login' | 'install'

const KEYBOARD_PREFIX = 'zmk-keyboard-'

/** Repo name, without `owner/`. */
export function repoName(fullName: string): string {
  const slash = fullName.lastIndexOf('/')
  return slash === -1 ? fullName : fullName.slice(slash + 1)
}

/**
 * Closed-chrome label. `zmk-keyboard-foo` shows `foo`.
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

/**
 * Closed-chrome label: branch when a repo is loaded (repo lives in the menu / title).
 * Falls back to the short repo name, then `GitHub`.
 */
export function githubChipLabel(
  fullName: string | null,
  fullNames: string[],
  branch: string | null
): string {
  if (!fullName) return 'GitHub'
  if (branch) return branch
  return repoChoiceLabel(fullName, fullNames)
}

/**
 * Login / install replaces the menu only when GitHub is the only source.
 * With Local beside it, those actions stay inside the menu so the source can still change.
 */
/** GitHub page where the signed-in user chooses which repos the app can read. */
export function manageReposUrl(appName: string): string {
  if (appName) {
    return `https://github.com/apps/${encodeURIComponent(appName)}/installations/new`
  }
  return 'https://github.com/settings/installations'
}

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
