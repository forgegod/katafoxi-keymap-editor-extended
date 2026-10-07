import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { resetEscapeStackForTests } from './lib/escape-stack'

// happy-dom comment nodes are not `instanceof Comment`. Svelte skips empty
// comment anchors with that check; without it, mount can throw (e.g. KeyEditor).
const happyComment = document.createComment('')
const CommentCtor = Object.getPrototypeOf(happyComment).constructor
if (!(happyComment instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', {
    configurable: true,
    writable: true,
    value: CommentCtor
  })
}

afterEach(() => {
  resetEscapeStackForTests()
})
