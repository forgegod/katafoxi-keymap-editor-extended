import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeymapValidationError } from '@keymap-editor/keymap-core'
import { config } from '../config.js'
import * as zmk from '../services/zmk/local-source.js'
import { keyboardsRoutes } from './keyboards.js'

const app = new Hono().route('/', keyboardsRoutes)

const APP_ORIGIN = new URL(config.APP_BASE_URL).origin

const LAYOUT = [{ row: 0, col: 0, x: 0, y: 0 }]
const KEYMAP = {
  keyboard: 'lark',
  keymap: 'default',
  layout: 'LAYOUT',
  layer_names: ['default'],
  layers: [[{ value: '&kp', params: [{ value: 'A', params: [] }] }]]
}

function jsonPostHeaders(extra: Record<string, string> = {}) {
  return {
    'Content-Type': 'application/json',
    Origin: APP_ORIGIN,
    ...extra
  }
}

let previousEnableLocal: boolean

beforeEach(() => {
  previousEnableLocal = config.ENABLE_LOCAL
})

afterEach(() => {
  vi.restoreAllMocks()
  config.ENABLE_LOCAL = previousEnableLocal
})

describe('keyboards routes when ENABLE_LOCAL is false', () => {
  beforeEach(() => {
    config.ENABLE_LOCAL = false
    vi.spyOn(zmk, 'loadLayout')
    vi.spyOn(zmk, 'loadKeymap')
    vi.spyOn(zmk, 'saveLocalKeymap')
  })

  it('GET /layout returns 404 and does not call zmk', async () => {
    const res = await app.request('/layout')
    expect(res.status).toBe(404)
    expect(zmk.loadLayout).not.toHaveBeenCalled()
    expect(zmk.loadKeymap).not.toHaveBeenCalled()
    expect(zmk.saveLocalKeymap).not.toHaveBeenCalled()
  })

  it('GET /keymap returns 404 and does not call zmk', async () => {
    const res = await app.request('/keymap')
    expect(res.status).toBe(404)
    expect(zmk.loadLayout).not.toHaveBeenCalled()
    expect(zmk.loadKeymap).not.toHaveBeenCalled()
    expect(zmk.saveLocalKeymap).not.toHaveBeenCalled()
  })

  it('POST /keymap returns 404 and does not call zmk', async () => {
    const res = await app.request('/keymap', {
      method: 'POST',
      headers: jsonPostHeaders(),
      body: JSON.stringify(KEYMAP)
    })
    expect(res.status).toBe(404)
    expect(zmk.loadLayout).not.toHaveBeenCalled()
    expect(zmk.loadKeymap).not.toHaveBeenCalled()
    expect(zmk.saveLocalKeymap).not.toHaveBeenCalled()
  })
})

describe('keyboards routes when ENABLE_LOCAL is true', () => {
  beforeEach(() => {
    config.ENABLE_LOCAL = true
  })

  it('GET /layout returns the mocked layout JSON', async () => {
    vi.spyOn(zmk, 'loadLayout').mockReturnValue(LAYOUT)
    const res = await app.request('/layout')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(LAYOUT)
    expect(zmk.loadLayout).toHaveBeenCalledOnce()
  })

  it('GET /keymap returns the mocked keymap JSON', async () => {
    vi.spyOn(zmk, 'loadKeymap').mockReturnValue(KEYMAP)
    const res = await app.request('/keymap')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(KEYMAP)
    expect(zmk.loadKeymap).toHaveBeenCalledOnce()
  })

  it('POST /keymap returns ok, mode, and warnings from saveLocalKeymap', async () => {
    const save = vi.spyOn(zmk, 'saveLocalKeymap').mockReturnValue({
      mode: 'splice',
      warnings: ['macros_expanded']
    })

    const res = await app.request('/keymap', {
      method: 'POST',
      headers: jsonPostHeaders(),
      body: JSON.stringify(KEYMAP)
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      mode: 'splice',
      warnings: ['macros_expanded']
    })
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith(KEYMAP)
  })

  it('POST /keymap returns 400 with errors when saveLocalKeymap throws KeymapValidationError', async () => {
    const errors = ['layer 0 is too short']
    vi.spyOn(zmk, 'saveLocalKeymap').mockImplementation(() => {
      throw new KeymapValidationError(errors)
    })

    const res = await app.request('/keymap', {
      method: 'POST',
      headers: jsonPostHeaders(),
      body: JSON.stringify(KEYMAP)
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      name: 'KeymapValidationError',
      errors
    })
  })

  it('POST /keymap returns generic JSON 500 without leaking the error text', async () => {
    const leak = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(zmk, 'saveLocalKeymap').mockImplementation(() => {
      throw Object.assign(new Error('ENOENT: no such file or directory, open \'/secret/zmk-config/config/info.json\''), {
        code: 'ENOENT',
        path: '/secret/zmk-config/config/info.json'
      })
    })

    const res = await app.request('/keymap', {
      method: 'POST',
      headers: jsonPostHeaders(),
      body: JSON.stringify(KEYMAP)
    })

    const body = await res.text()
    expect(res.status).toBe(500)
    expect(JSON.parse(body)).toEqual({ error: 'internal' })
    expect(body).not.toMatch(/secret|zmk-config|info\.json/)
    expect(leak).toHaveBeenCalled()
  })

  it('POST /keymap with a foreign Origin returns 403 and does not save', async () => {
    const save = vi.spyOn(zmk, 'saveLocalKeymap')
    const res = await app.request('/keymap', {
      method: 'POST',
      headers: jsonPostHeaders({ Origin: 'https://evil.example' }),
      body: JSON.stringify(KEYMAP)
    })
    expect(res.status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it('POST /keymap with a 5 MB body returns 413 and does not save', async () => {
    const save = vi.spyOn(zmk, 'saveLocalKeymap')
    const res = await app.request('/keymap', {
      method: 'POST',
      headers: jsonPostHeaders(),
      body: 'x'.repeat(5_000_000)
    })
    expect(res.status).toBe(413)
    expect(save).not.toHaveBeenCalled()
  })

  it('POST /keymap with text/plain returns 415 and does not save', async () => {
    const save = vi.spyOn(zmk, 'saveLocalKeymap')
    const res = await app.request('/keymap', {
      method: 'POST',
      headers: jsonPostHeaders({ 'Content-Type': 'text/plain' }),
      body: JSON.stringify(KEYMAP)
    })
    expect(res.status).toBe(415)
    expect(save).not.toHaveBeenCalled()
  })

  it('GET /layout with a non-loopback Host returns 403 and does not load', async () => {
    const load = vi.spyOn(zmk, 'loadLayout')
    const res = await app.request('http://evil.example/layout')
    expect(res.status).toBe(403)
    expect(load).not.toHaveBeenCalled()
  })

  it('GET /layout returns 404 JSON without paths when the layout file is missing', async () => {
    const leak = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(zmk, 'loadLayout').mockImplementation(() => {
      throw Object.assign(new Error('Layout info.json not found'), { code: 'ENOENT' })
    })

    const res = await app.request('/layout')
    const body = await res.text()
    expect(res.status).toBe(404)
    expect(JSON.parse(body)).toEqual({ error: 'not_found' })
    expect(body).not.toMatch(/[/\\]|info\.json|ZMK/)
    expect(leak).toHaveBeenCalled()
  })

  it('GET /layout returns 400 JSON when layout JSON is invalid', async () => {
    const leak = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(zmk, 'loadLayout').mockImplementation(() => {
      throw new SyntaxError('Unexpected token in JSON at position 0')
    })

    const res = await app.request('/layout')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid' })
    expect(leak).toHaveBeenCalled()
  })

  it('GET /keymap returns 400 JSON when keymap parsing fails', async () => {
    const leak = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(zmk, 'loadKeymap').mockImplementation(() => {
      throw new TypeError('Cannot read properties of undefined')
    })

    const res = await app.request('/keymap')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid' })
    expect(leak).toHaveBeenCalled()
  })
})
