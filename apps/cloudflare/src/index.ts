import { DurableObject } from 'cloudflare:workers'
import { forwardRequest, runtimeEnvironment, waitForHealth, type RuntimeSettings } from './runtime.js'

interface Env extends RuntimeSettings {
  KEYMAP_APP: DurableObjectNamespace<KeymapContainer>
}

export class KeymapContainer extends DurableObject<Env> {
  private starting: Promise<void> | undefined

  async fetch(request: Request): Promise<Response> {
    this.starting ??= this.ensureReady(new URL(request.url).origin).finally(() => {
      this.starting = undefined
    })
    await this.starting
    return this.ctx.container!.getTcpPort(8080).fetch(forwardRequest(request))
  }

  private async ensureReady(origin: string): Promise<void> {
    const container = this.ctx.container
    if (!container) throw new Error('Container binding is missing')
    const env = runtimeEnvironment(this.env, origin)
    // Restart when runtime settings/secrets change; persist a digest, never the secrets.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(env)))
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    const previous = await this.ctx.storage.get<string>('runtimeConfigHash')
    if (container.running && previous !== hash) await container.destroy()
    if (!container.running) {
      container.start({ env, enableInternet: true })
      await this.ctx.storage.put('runtimeConfigHash', hash)
    }
    // Idle sleep limits testing costs. Restart/sleep invalidates in-memory login sessions.
    await container.setInactivityTimeout(30 * 60 * 1000)
    const port = container.getTcpPort(8080)
    await waitForHealth(
      () => port.fetch('http://container/health', { signal: AbortSignal.timeout(1000) }),
      milliseconds => scheduler.wait(milliseconds)
    )
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // No load-balancing: the Hono session store is process-local.
      return await env.KEYMAP_APP.getByName('keymap-editor').fetch(request)
    } catch {
      return new Response('The keymap runtime is unavailable. Check the container configuration and logs.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      })
    }
  }
} satisfies ExportedHandler<Env>
