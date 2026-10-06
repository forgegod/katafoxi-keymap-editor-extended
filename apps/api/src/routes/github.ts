import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { getCookie } from 'hono/cookie'
import {
  KeymapValidationError,
  InfoValidationError,
  parseKeymap,
  validateKeymapJson,
  validateInfoJson
} from '@keymap-editor/keymap-core'
import * as auth from '../services/github/auth.js'
import {
  consumeOauthState,
  createOauthState,
  createSession,
  deleteSession,
  oauthTokenNeedsRefresh,
  touchSession,
  updateSessionOauthTokens,
  type Session
} from '../services/github/sessions.js'
import * as installations from '../services/github/installations.js'
import {
  assertInstallationAccess,
  cacheInstallationAccess,
  InstallationAccessError
} from '../services/github/installation-access.js'
import * as files from '../services/github/files.js'
import * as builds from '../services/github/builds.js'

type Variables = {
  user: { sub: string; oauth_access_token: string }
  session: Session
}

export const githubRoutes = new Hono<{ Variables: Variables }>()

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const POST_BODY_MAX_BYTES = 2_000_000
const limitPostBody = bodyLimit({ maxSize: POST_BODY_MAX_BYTES })

githubRoutes.use('*', async (c, next) => {
  if (c.req.method === 'POST') return limitPostBody(c, next)
  await next()
})

githubRoutes.use('*', async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method) && !auth.isTrustedAppOrigin(c)) {
    return c.body(null, 403)
  }
  await next()
})

githubRoutes.get('/authorize', async c => {
  const oauthError = c.req.query('error')
  if (oauthError) {
    const state = c.req.query('state')
    if (state) consumeOauthState(state)
    auth.clearOauthStateCookie(c)
    return c.redirect(auth.createOauthDeniedUrl())
  }

  const code = c.req.query('code')
  if (code) {
    try {
      const state = c.req.query('state')
      const cookieState = getCookie(c, auth.OAUTH_STATE_COOKIE)
      if (!state || !cookieState || state !== cookieState || !consumeOauthState(state)) {
        auth.clearOauthStateCookie(c)
        return c.body(null, 401)
      }

      const { data: oauth } = await auth.getOauthToken(code)
      const oauthData = auth.parseOauthTokenPayload(oauth)
      if (!oauthData) {
        auth.clearOauthStateCookie(c)
        return c.body(null, 401)
      }
      const { data: user } = await auth.getOauthUser(oauthData.accessToken)
      const login = (user as { login: string }).login
      const previousSid = getCookie(c, auth.SID_COOKIE)
      if (previousSid) deleteSession(previousSid)
      const sid = createSession({
        login,
        oauthAccessToken: oauthData.accessToken,
        oauthRefreshToken: oauthData.refreshToken,
        expiresInSec: oauthData.expiresInSec
      })
      auth.setSidCookie(c, sid)
      auth.clearOauthStateCookie(c)
      return c.redirect(auth.createOauthReturnUrl())
    } catch (err) {
      console.error(err)
      return c.body(null, 500)
    }
  }

  const previousSid = getCookie(c, auth.SID_COOKIE)
  if (previousSid) {
    deleteSession(previousSid)
    auth.clearSidCookie(c)
  }

  const state = createOauthState()
  auth.setOauthStateCookie(c, state)
  return c.redirect(auth.createOauthFlowUrl(state))
})

githubRoutes.post('/logout', c => {
  const sid = getCookie(c, auth.SID_COOKIE)
  if (sid) deleteSession(sid)
  auth.clearSidCookie(c)
  return c.body(null, 204)
})

githubRoutes.use('*', async (c, next) => {
  const sid = getCookie(c, auth.SID_COOKIE)
  if (!sid) return c.body(null, 401)

  const session = touchSession(sid)
  if (!session) {
    auth.clearSidCookie(c)
    return c.body(null, 401)
  }

  if (oauthTokenNeedsRefresh(session)) {
    const refreshToken = session.oauthRefreshToken
    if (!refreshToken) {
      deleteSession(sid)
      auth.clearSidCookie(c)
      return c.body(null, 401)
    }
    try {
      const { data } = await auth.refreshOauthToken(refreshToken)
      const refreshed = auth.parseOauthTokenPayload(data)
      if (!refreshed) {
        deleteSession(sid)
        auth.clearSidCookie(c)
        return c.body(null, 401)
      }
      updateSessionOauthTokens(sid, {
        oauthAccessToken: refreshed.accessToken,
        oauthRefreshToken: refreshed.refreshToken ?? refreshToken,
        expiresInSec: refreshed.expiresInSec
      })
    } catch (err) {
      console.error(err)
      deleteSession(sid)
      auth.clearSidCookie(c)
      return c.body(null, 401)
    }
  }

  // Keep browser cookie maxAge aligned with the sliding server TTL.
  auth.setSidCookie(c, sid)

  c.set('user', {
    sub: session.login,
    oauth_access_token: session.oauthAccessToken
  })
  c.set('session', session)
  await next()
})

githubRoutes.get('/installation', async c => {
  const user = c.get('user')
  try {
    const { repoAccess, ...installationRepos } = await installations.fetchInstallationRepos(
      user.oauth_access_token
    )
    cacheInstallationAccess(c.get('session'), repoAccess)
    if ((installationRepos.installations as unknown[]).length === 0) {
      console.log(`User ${user.sub} does not have an active app installation.`)
    }
    return c.json({ login: user.sub, ...installationRepos })
  } catch (err) {
    return handleGithubError(c, err)
  }
})

githubRoutes.post('/installation/:installationId/:repository/branches', async c => {
  const { installationId, repository: rawRepository } = c.req.param()
  let body: { name?: unknown; from?: unknown } = {}
  try {
    body = await c.req.json()
  } catch {
    return c.json({ name: 'BranchNameError', errors: ['Enter a branch name'] }, 400)
  }
  const name = typeof body.name === 'string' ? body.name : ''
  const from = typeof body.from === 'string' ? body.from : ''
  try {
    const repository = installations.assertRepositoryName(rawRepository)
    installations.assertBranchName(name)
    installations.assertCommitish(from)
    await assertInstallationAccess(
      c.get('user'),
      installationId,
      repository,
      c.get('session'),
      { requirePush: true }
    )
    const { data } = await auth.createInstallationToken(installationId, { repository })
    const created = await installations.createBranch(
      (data as { token: string }).token,
      repository,
      name,
      from
    )
    return c.json(created, 201)
  } catch (err) {
    if (err instanceof InstallationAccessError) {
      return c.body(null, 403)
    }
    if (
      err instanceof installations.BranchNameError ||
      err instanceof installations.RepositoryNameError
    ) {
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 422) {
      return c.json(
        { name: 'BranchExists', errors: ['A branch with that name already exists'] },
        409
      )
    }
    if (status === 404) {
      return c.json({ name: 'BranchNotFound', errors: ['The source branch was not found'] }, 400)
    }
    return handleGithubError(c, err)
  }
})

githubRoutes.get('/installation/:installationId/:repository/branches', async c => {
  const { installationId, repository: rawRepository } = c.req.param()
  try {
    const repository = installations.assertRepositoryName(rawRepository)
    await assertInstallationAccess(
      c.get('user'),
      installationId,
      repository,
      c.get('session')
    )
    const { data } = await auth.createInstallationToken(installationId, { repository })
    const branches = await installations.fetchRepoBranches(
      (data as { token: string }).token,
      repository
    )
    return c.json(branches)
  } catch (err) {
    if (err instanceof InstallationAccessError) {
      return c.body(null, 403)
    }
    if (err instanceof installations.RepositoryNameError) {
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    return handleGithubError(c, err)
  }
})

githubRoutes.get('/keyboard-files/:installationId/:repository', async c => {
  const { installationId, repository: rawRepository } = c.req.param()
  const rawBranch = c.req.query('branch')
  try {
    const repository = installations.assertRepositoryName(rawRepository)
    const branch =
      rawBranch == null || rawBranch === ''
        ? undefined
        : installations.assertBranchName(rawBranch)
    await assertInstallationAccess(
      c.get('user'),
      installationId,
      repository,
      c.get('session')
    )
    const { info, keymap, hostSnapshot, headSha } = await files.fetchKeyboardFiles(
      installationId,
      repository,
      branch
    )
    if (info != null) validateInfoJson(info)
    validateKeymapJson(keymap)
    return c.json({
      info: info ?? null,
      keymap: parseKeymap(keymap as { layers: string[][] }),
      hostSnapshot: hostSnapshot ?? null,
      headSha
    })
  } catch (err) {
    if (err instanceof InstallationAccessError) {
      return c.body(null, 403)
    }
    if (
      err instanceof installations.BranchNameError ||
      err instanceof installations.RepositoryNameError
    ) {
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    if (err instanceof files.MissingRepoFile) {
      console.error(`Validation error in ${rawRepository} (${rawBranch}):`, err.name, err.errors)
      return c.json({ name: err.name, path: err.path, errors: err.errors }, 400)
    }
    if (err instanceof InfoValidationError || err instanceof KeymapValidationError) {
      console.error(`Validation error in ${rawRepository} (${rawBranch}):`, err.name, err.errors)
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    return handleGithubError(c, err)
  }
})

githubRoutes.get('/builds/:installationId/:repository/artifact/:artifactId', async c => {
  const { installationId, repository: rawRepository, artifactId } = c.req.param()
  if (!/^\d+$/.test(artifactId)) return c.body(null, 400)
  const archiveName = builds.firmwareArchiveName(c.req.query('name'))
  try {
    const repository = installations.assertRepositoryName(rawRepository)
    await assertInstallationAccess(
      c.get('user'),
      installationId,
      repository,
      c.get('session')
    )
    const zip = await builds.downloadFirmwareArtifact(
      installationId,
      repository,
      artifactId
    )
    if (!zip.body) return c.body(null, 502)
    return c.body(zip.body, 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${archiveName}"`
    })
  } catch (err) {
    if (err instanceof InstallationAccessError) {
      return c.body(null, 403)
    }
    if (err instanceof builds.ArtifactTooLargeError) {
      return c.body(null, 413)
    }
    if (err instanceof installations.RepositoryNameError) {
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    return handleGithubError(c, err)
  }
})

githubRoutes.get('/builds/:installationId/:repository', async c => {
  const { installationId, repository: rawRepository } = c.req.param()
  const rawBranch = c.req.query('branch')
  if (!rawBranch) return c.body(null, 400)
  try {
    const repository = installations.assertRepositoryName(rawRepository)
    const branch = installations.assertBranchName(rawBranch)
    await assertInstallationAccess(
      c.get('user'),
      installationId,
      repository,
      c.get('session')
    )
    const build = await builds.fetchFirmwareBuild(installationId, repository, branch)
    return c.json(build)
  } catch (err) {
    if (err instanceof InstallationAccessError) {
      return c.body(null, 403)
    }
    if (
      err instanceof installations.BranchNameError ||
      err instanceof installations.RepositoryNameError
    ) {
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    return handleGithubError(c, err)
  }
})

githubRoutes.post('/keyboard-files/:installationId/:repository/:branch', async c => {
  const { installationId, repository: rawRepository, branch: rawBranch } = c.req.param()
  let body: {
    keymap?: unknown
    layout?: unknown
    hostSnapshot?: unknown
    hostDeliverables?: unknown
    baseSha?: unknown
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ errors: ['Request body must be valid JSON'] }, 400)
  }
  try {
    const repository = installations.assertRepositoryName(rawRepository)
    const branch = installations.assertBranchName(rawBranch)
    await assertInstallationAccess(
      c.get('user'),
      installationId,
      repository,
      c.get('session'),
      { requirePush: true }
    )
    const { keymap, layout, hostSnapshot, hostDeliverables, baseSha } = body as {
      keymap: Parameters<typeof files.commitChanges>[4]
      layout: Parameters<typeof files.commitChanges>[3]
      hostSnapshot?: Parameters<typeof files.commitChanges>[5]
      hostDeliverables?: Parameters<typeof files.commitChanges>[6]
      baseSha?: unknown
    }
    const { mode, warnings } = await files.commitChanges(
      installationId,
      repository,
      branch,
      layout,
      keymap,
      hostSnapshot ?? null,
      hostDeliverables ?? null,
      typeof baseSha === 'string' ? baseSha : null
    )
    return c.json({ ok: true, mode, warnings })
  } catch (err) {
    if (err instanceof InstallationAccessError) {
      return c.body(null, 403)
    }
    if (
      err instanceof installations.BranchNameError ||
      err instanceof installations.RepositoryNameError
    ) {
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    if (err instanceof KeymapValidationError) {
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    if (err instanceof files.StaleRepoBase) {
      return c.json({ name: err.name, errors: err.errors }, 409)
    }
    return handleGithubError(c, err)
  }
})

function handleGithubError(
  c: {
    body: (data: null, status: 401 | 500) => Response
    json: (data: unknown, status: 409) => Response
  },
  err: unknown
) {
  const e = err as { response?: { status: number; data: unknown } }
  if (e.response?.status === 401) {
    console.error('Received upstream authentication error', e.response.data)
    return c.body(null, 401)
  }
  if (e.response?.status === 422) {
    return c.json(
      { name: 'StaleRepoBase', errors: [files.BRANCH_CHANGED_NOTICE] },
      409
    )
  }
  console.error(e.response ? `[${e.response.status}] ${e.response.data}` : err, err)
  return c.body(null, 500)
}
