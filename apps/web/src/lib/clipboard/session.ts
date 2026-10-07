import { draftIdentityKey, type DraftIdentity } from '../draft-storage.js'

const PREFIX = 'clipboardOriginalSource:'

/** Keep pasted `.keymap` text for Copy splice across draft restore in this browser tab. */
export function readClipboardOriginalSource(
  identity: DraftIdentity
): string | null {
  try {
    return sessionStorage.getItem(PREFIX + draftIdentityKey(identity))
  } catch {
    return null
  }
}

export function writeClipboardOriginalSource(
  identity: DraftIdentity,
  source: string | null
): void {
  try {
    const key = PREFIX + draftIdentityKey(identity)
    if (!source) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, source)
  } catch {
    /* private mode */
  }
}
