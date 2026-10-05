import { fetchInstallationRepos } from './installations.js'
import type { Session } from './sessions.js'

/** Short TTL so ACL checks do not hit GitHub on every request. */
export const INSTALLATION_ACCESS_TTL_MS = 5 * 60 * 1000

export class InstallationAccessError extends Error {
  constructor(message = 'Installation or repository is not accessible') {
    super(message)
    this.name = 'InstallationAccessError'
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
  session: Session
): Promise<void> {
  const installId = Number(installationId)
  if (!Number.isFinite(installId) || installId <= 0 || !repository.includes('/')) {
    throw new InstallationAccessError()
  }

  const now = Date.now()
  const cached = session.installationAccess
  if (!cached || cached.expiresAt <= now) {
    const { repoInstallationMap } = await fetchInstallationRepos(user.oauth_access_token)
    session.installationAccess = {
      repoInstallationMap,
      expiresAt: now + INSTALLATION_ACCESS_TTL_MS
    }
  }

  const allowedInstallation = session.installationAccess?.repoInstallationMap[repository]
  if (allowedInstallation !== installId) {
    throw new InstallationAccessError()
  }
}
