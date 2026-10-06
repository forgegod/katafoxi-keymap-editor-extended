import { describe, expect, it } from 'vitest'
import { GETTER_NAMES } from './assign-api'
import { EditorState } from './state.svelte'

describe('EditorState mixin façade', () => {
  it('exposes each GETTER_NAMES name as a prototype accessor', () => {
    for (const name of GETTER_NAMES) {
      const desc = Object.getOwnPropertyDescriptor(EditorState.prototype, name)
      expect(desc, name).toMatchObject({
        configurable: true,
        enumerable: false
      })
      expect(typeof desc?.get, name).toBe('function')
      expect(desc?.set, name).toBeUndefined()
      expect(desc?.value, name).toBeUndefined()
    }
  })
})
