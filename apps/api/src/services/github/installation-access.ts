import { fetchInstallationRepos } from './installations.js'
import type { InstallationRepoAccess, Session } from './sessions.js'

/** Short TTL so ACL checks do not hit GitHub on every request. */
export const INSTALLATION_ACCESS_TTL_MS = 5 * 60 * 1000

export class InstallationAccessError extends Error {
  constructor(message = 'Installation or repository is not accessible') {
    super(message)
    this.name = 'InstallationAccessError'
  }
}

export function cacheInstallationAccess(
  session: Session,
  repoAccess: Record<string, InstallationRepoAccess>,
  now = Date.now()
): void {
  session.installationAccess = {
    repos: repoAccess,
    expiresAt: now + INSTALLATION_ACCESS_TTL_MS
  }
}

/**
 * Verify the signed-in user can use this App installation + repository pair
 * before minting an installation token. Caches the allowed map on the session.
 */
export async function assertInstallationAccess(
  user: { oauth_access_token: string },
  installationId: string,
  repository: string,
  session: Session,
  options?: { requirePush?: boolean }
): Promise<void> {
  if (!/^\d+$/.test(installationId) || !repository.includes('/')) {
    throw new InstallationAccessError()
  }
  const installId = Number(installationId)
  if (!Number.isFinite(installId) || installId <= 0) {
    throw new InstallationAccessError()
  }

  const now = Date.now()
  const cached = session.installationAccess
  if (!cached || cached.expiresAt <= now) {
    const { repoAccess } = await fetchInstallationRepos(user.oauth_access_token)
    cacheInstallationAccess(session, repoAccess, now)
  }

  const allowed = session.installationAccess?.repos[repository]
  if (!allowed || allowed.installationId !== installId) {
    throw new InstallationAccessError()
  }
  if (options?.requirePush && !allowed.push) {
    throw new InstallationAccessError()
  }
}
