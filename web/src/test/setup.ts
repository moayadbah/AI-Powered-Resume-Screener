import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from './server'

// `error` so an unhandled request is a test failure, not a silent 404 that
// shows up as a confusing assertion error later.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  server.resetHandlers()
  cleanup()
  localStorage.clear()
})

afterAll(() => server.close())
