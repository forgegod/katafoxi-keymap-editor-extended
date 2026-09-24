import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeymapValidationError } from '@keymap-editor/keymap-core'
import { config } from '../config.js'
import * as zmk from '../services/zmk/local-source.js'
import { keyboardsRoutes } from './keyboards.js'

const app = new Hono().route('/', keyboardsRoutes)

const LAYOUT = [{ row: 0, col: 0, x: 0, y: 0 }]
const KEYMAP = {
  keyboard: 'lark',
  keymap: 'default',
  layout: 'LAYOUT',
  layer_names: ['default'],
  layers: [[{ value: '&kp', params: [{ value: 'A', params: [] }] }]]
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(KEYMAP)
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      name: 'KeymapValidationError',
      errors
    })
  })
})
