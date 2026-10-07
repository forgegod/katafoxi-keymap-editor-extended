import { describe, expect, it, vi } from 'vitest'
import { openDb } from './idb'

describe('openDb', () => {
  it('closes the database when afterOpen rejects', async () => {
    const name = `idb-afteropen-${crypto.randomUUID()}`
    const close = vi.fn()
    await expect(
      openDb({
        name,
        version: 1,
        afterOpen: async db => {
          const original = db.close.bind(db)
          Object.defineProperty(db, 'close', {
            configurable: true,
            value: () => {
              close()
              original()
            }
          })
          throw new Error('migrate failed')
        }
      })
    ).rejects.toThrow('migrate failed')
    expect(close).toHaveBeenCalled()
  })
})
