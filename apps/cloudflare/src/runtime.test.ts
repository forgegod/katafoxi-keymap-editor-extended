import { describe, expect, it, vi } from 'vitest'
import { forwardRequest, runtimeEnvironment, waitForHealth } from './runtime.js'

const ORIGIN = 'https://keymap.example.com'

describe('container runtime environment', () => {
  it('uses the public HTTPS origin while disabling local disk access', () => {
    const env = runtimeEnvironment({}, ORIGIN)
    expect(env).toMatchObject({
      NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '8080',
      ENABLE_LOCAL: 'false', ENABLE_DEV_SERVER: 'false', TRUST_PROXY: 'true',
      ENABLE_GITHUB: 'false', APP_BASE_URL: ORIGIN,
      GITHUB_OAUTH_CALLBACK_URL: `${ORIGIN}/github/authorize`
    })
  })

  it.each(['http://keymap.example.com', 'https://user:pass@keymap.example.com', 'https://keymap.example.com/path', 'https://keymap.example.com/?token=x'])(
    'rejects a noncanonical public origin: %s', origin => {
      expect(() => runtimeEnvironment({ APP_BASE_URL: origin }, ORIGIN)).toThrow()
    }
  )

  it('fails closed when GitHub is enabled without all credentials', () => {
    expect(() => runtimeEnvironment({ ENABLE_GITHUB: 'true' }, ORIGIN)).toThrow('GitHub runtime secrets are incomplete')
  })

  it('passes only explicitly selected runtime secrets', () => {
    const secrets = {
      ENABLE_GITHUB: 'true', GITHUB_APP_ID: '123', GITHUB_CLIENT_ID: 'test-id',
      GITHUB_CLIENT_SECRET: 'test-secret', GITHUB_APP_PRIVATE_KEY: 'test-pem',
      UNRELATED_SECRET: 'not-for-the-container'
    }
    expect(runtimeEnvironment(secrets, ORIGIN)).toMatchObject({
      ENABLE_GITHUB: 'true', GITHUB_APP_ID: '123', GITHUB_CLIENT_ID: 'test-id',
      GITHUB_CLIENT_SECRET: 'test-secret', GITHUB_APP_PRIVATE_KEY: 'test-pem'
    })
    expect(runtimeEnvironment(secrets, ORIGIN)).not.toHaveProperty('UNRELATED_SECRET')
  })
})

describe('container forwarding', () => {
  it('preserves request data and replaces spoofable proxy headers', async () => {
    const original = new Request(`${ORIGIN}/github/commit?branch=test`, {
      method: 'POST', body: 'payload',
      headers: {
        'CF-Connecting-IP': '192.0.2.1', 'X-Forwarded-For': 'spoofed',
        'X-Real-IP': 'spoofed', Host: 'keymap.example.com', Cookie: 'sid=test',
        Origin: ORIGIN
      }
    })
    const forwarded = forwardRequest(original)
    expect(forwarded.url).toBe('http://container/github/commit?branch=test')
    expect(forwarded.method).toBe('POST')
    expect(await forwarded.text()).toBe('payload')
    expect(forwarded.headers.get('cookie')).toBe('sid=test')
    expect(forwarded.headers.get('origin')).toBe(ORIGIN)
    expect(forwarded.headers.get('host')).toBeNull()
    expect(forwarded.headers.get('x-forwarded-for')).toBe('192.0.2.1')
    expect(forwarded.headers.get('x-real-ip')).toBe('192.0.2.1')
  })

  it('removes client-supplied proxy headers when Cloudflare did not provide an IP', () => {
    const request = new Request(`${ORIGIN}/health`, { headers: { 'X-Forwarded-For': 'spoofed', 'X-Real-IP': 'spoofed' } })
    const forwarded = forwardRequest(request)
    expect(forwarded.headers.has('x-forwarded-for')).toBe(false)
    expect(forwarded.headers.has('x-real-ip')).toBe(false)
  })
})

describe('container readiness', () => {
  it('retries failed health checks before accepting traffic', async () => {
    const fetchHealth = vi.fn().mockRejectedValueOnce(new Error('not listening')).mockResolvedValue(new Response(null, { status: 200 }))
    const delay = vi.fn().mockResolvedValue(undefined)
    await waitForHealth(fetchHealth, delay)
    expect(fetchHealth).toHaveBeenCalledTimes(2)
    expect(delay).toHaveBeenCalledTimes(1)
  })

  it('fails startup after bounded unhealthy responses', async () => {
    const fetchHealth = vi.fn().mockImplementation(async () => new Response(null, { status: 503 }))
    const delay = vi.fn().mockResolvedValue(undefined)
    await expect(waitForHealth(fetchHealth, delay)).rejects.toThrow('Container did not become healthy')
    expect(fetchHealth).toHaveBeenCalledTimes(100)
  })
})
