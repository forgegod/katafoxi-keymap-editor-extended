import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { resetEscapeStackForTests } from './lib/escape-stack'

afterEach(() => {
  resetEscapeStackForTests()
})
