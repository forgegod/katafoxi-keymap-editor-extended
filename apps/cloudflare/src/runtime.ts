export type RuntimeSettings = {
  APP_BASE_URL?: string
  ENABLE_GITHUB?: string
  GITHUB_APP_ID?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GITHUB_APP_PRIVATE_KEY?: string
}

const GITHUB_KEYS = ['GITHUB_APP_ID', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_APP_PRIVATE_KEY'] as const

export function runtimeEnvironment(settings: RuntimeSettings, requestOrigin: string): Record<string, string> {
  const publicUrl = new URL(settings.APP_BASE_URL || requestOrigin)
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password ||
      publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
    throw new Error('APP_BASE_URL must be a canonical HTTPS origin')
  }
  const env: Record<string, string> = {
    NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '8080',
    ENABLE_LOCAL: 'false', ENABLE_DEV_SERVER: 'false', TRUST_PROXY: 'true',
    ENABLE_GITHUB: settings.ENABLE_GITHUB === 'true' ? 'true' : 'false',
    APP_BASE_URL: publicUrl.origin,
    GITHUB_OAUTH_CALLBACK_URL: `${publicUrl.origin}/github/authorize`
  }
  if (env.ENABLE_GITHUB === 'true') {
    if (GITHUB_KEYS.some(key => !settings[key])) {
      throw new Error('GitHub runtime secrets are incomplete')
    }
    for (const key of GITHUB_KEYS) env[key] = settings[key]!
  }
  return env
}

export function forwardRequest(request: Request): Request {
  const url = new URL(request.url)
  url.protocol = 'http:'
  url.host = 'container'
  const forwarded = new Request(url, request)
  forwarded.headers.delete('host')
  forwarded.headers.delete('x-forwarded-for')
  forwarded.headers.delete('x-real-ip')
  const clientIp = request.headers.get('cf-connecting-ip')
  if (clientIp) {
    forwarded.headers.set('x-forwarded-for', clientIp)
    forwarded.headers.set('x-real-ip', clientIp)
  }
  return forwarded
}

export async function waitForHealth(
  fetchHealth: () => Promise<Response>,
  delay: (milliseconds: number) => Promise<void>
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetchHealth()
      await response.body?.cancel()
      if (response.ok) return
    } catch {
      // The process may be running before its HTTP listener is ready.
    }
    if (attempt < 99) await delay(200)
  }
  throw new Error('Container did not become healthy')
}
