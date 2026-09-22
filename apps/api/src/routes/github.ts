import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import {
  KeymapValidationError,
  InfoValidationError,
  parseKeymap,
  validateKeymapJson,
  validateInfoJson
} from '@keymap-editor/keymap-core'
import {
  SID_COOKIE,
  OAUTH_STATE_COOKIE,
  clearOauthStateCookie,
  clearSidCookie,
  createOauthFlowUrl,
  createOauthReturnUrl,
  createInstallationToken,
  getOauthToken,
  getOauthUser,
  setOauthStateCookie,
  setSidCookie
} from '../services/github/auth.js'
import {
  consumeOauthState,
  createOauthState,
  createSession,
  deleteSession,
  touchSession
} from '../services/github/sessions.js'
import { fetchInstallationRepos, fetchRepoBranches } from '../services/github/installations.js'
import { MissingRepoFile, fetchKeyboardFiles, commitChanges } from '../services/github/files.js'

type Variables = {
  user: { sub: string; oauth_access_token: string }
}

export const githubRoutes = new Hono<{ Variables: Variables }>()

githubRoutes.get('/authorize', async c => {
  const code = c.req.query('code')
  if (code) {
    try {
      const state = c.req.query('state')
      const cookieState = getCookie(c, OAUTH_STATE_COOKIE)
      if (!state || !cookieState || state !== cookieState || !consumeOauthState(state)) {
        clearOauthStateCookie(c)
        return c.body(null, 401)
      }

      const { data: oauth } = await getOauthToken(code)
      const oauthData = oauth as { access_token: string }
      const { data: user } = await getOauthUser(oauthData.access_token)
      const login = (user as { login: string }).login
      const sid = createSession({
        login,
        oauthAccessToken: oauthData.access_token
      })
      setSidCookie(c, sid)
      clearOauthStateCookie(c)
      return c.redirect(createOauthReturnUrl())
    } catch (err) {
      console.error(err)
      return c.body(null, 500)
    }
  }

  const state = createOauthState()
  setOauthStateCookie(c, state)
  return c.redirect(createOauthFlowUrl(state))
})

githubRoutes.post('/webhook', c => c.body(null, 200))

githubRoutes.post('/logout', c => {
  const sid = getCookie(c, SID_COOKIE)
  if (sid) deleteSession(sid)
  clearSidCookie(c)
  return c.body(null, 204)
})

githubRoutes.use('*', async (c, next) => {
  const sid = getCookie(c, SID_COOKIE)
  if (!sid) return c.body(null, 401)

  const session = touchSession(sid)
  if (!session) {
    clearSidCookie(c)
    return c.body(null, 401)
  }

  c.set('user', {
    sub: session.login,
    oauth_access_token: session.oauthAccessToken
  })
  await next()
})

githubRoutes.get('/installation', async c => {
  const user = c.get('user')
  try {
    const installationRepos = await fetchInstallationRepos(user.oauth_access_token)
    if ((installationRepos.installations as unknown[]).length === 0) {
      console.log(`User ${user.sub} does not have an active app installation.`)
    }
    return c.json(installationRepos)
  } catch (err) {
    return handleGithubError(c, err)
  }
})

githubRoutes.get('/installation/:installationId/:repository/branches', async c => {
  const { installationId, repository } = c.req.param()
  try {
    const { data } = await createInstallationToken(installationId)
    const branches = await fetchRepoBranches(
      (data as { token: string }).token,
      repository
    )
    return c.json(branches)
  } catch (err) {
    return handleGithubError(c, err)
  }
})

githubRoutes.get('/keyboard-files/:installationId/:repository', async c => {
  const { installationId, repository } = c.req.param()
  const branch = c.req.query('branch')
  try {
    const { info, keymap } = await fetchKeyboardFiles(installationId, repository, branch)
    validateInfoJson(info)
    validateKeymapJson(keymap)
    return c.json({
      info,
      keymap: parseKeymap(keymap as { layers: string[][] })
    })
  } catch (err) {
    if (err instanceof MissingRepoFile) {
      console.error(`Validation error in ${repository} (${branch}):`, err.name, err.errors)
      return c.json({ name: err.name, path: err.path, errors: err.errors }, 400)
    }
    if (err instanceof InfoValidationError || err instanceof KeymapValidationError) {
      console.error(`Validation error in ${repository} (${branch}):`, err.name, err.errors)
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    return handleGithubError(c, err)
  }
})

githubRoutes.post('/keyboard-files/:installationId/:repository/:branch', async c => {
  const { installationId, repository, branch } = c.req.param()
  const { keymap, layout } = await c.req.json()
  try {
    const { mode, warnings } = await commitChanges(
      installationId,
      repository,
      branch,
      layout,
      keymap
    )
    return c.json({ ok: true, mode, warnings })
  } catch (err) {
    if (err instanceof KeymapValidationError) {
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    return handleGithubError(c, err)
  }
})

function handleGithubError(c: { body: (data: null, status: 401 | 500) => Response }, err: unknown) {
  const e = err as { response?: { status: number; data: unknown } }
  if (e.response?.status === 401) {
    console.error('Received upstream authentication error', e.response.data)
    return c.body(null, 401)
  }
  console.error(e.response ? `[${e.response.status}] ${e.response.data}` : err, err)
  return c.body(null, 500)
}
