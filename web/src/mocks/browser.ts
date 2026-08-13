/**
 * MSW in the browser, for developing without a running api-service.
 *
 * Enabled with VITE_USE_MOCKS=true (see .env.development). This is the
 * "both sides build against stubs" step in docs/10-TEAM-WORKFLOW.md - it means
 * the dashboard does not block on Marwan's API being finished.
 *
 * Handlers are shared with the test suite, so the browser and the tests cannot
 * drift apart.
 */

import { setupWorker } from 'msw/browser'

import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

export async function startMocks() {
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
  })
  console.info('[mocks] MSW running - API responses are stubbed from the contract examples')
}
