/** Node-side MSW server for the test suite. Handlers live in src/mocks. */

import { setupServer } from 'msw/node'

import { handlers } from '../mocks/handlers'

export { BASE, CANDIDATES, JOB, errorBody, handlers } from '../mocks/handlers'

export const server = setupServer(...handlers)
