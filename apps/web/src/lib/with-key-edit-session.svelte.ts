import {
  createKeyEditSession,
  type KeyEditSessionInput
} from './key-edit-session.svelte'

export type KeyEditSession = ReturnType<typeof createKeyEditSession>

/** Runes in createKeyEditSession need an effect tree outside components. */
export function withKeyEditSession<T>(
  input: KeyEditSessionInput,
  run: (session: KeyEditSession) => T
): T {
  let result!: T
  const stop = $effect.root(() => {
    result = run(createKeyEditSession(input))
  })
  stop()
  return result
}
