import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { AuthProvider } from '../auth/AuthContext'

export function renderApp(ui: ReactNode, { route = '/' } = {}) {
  const queryClient = new QueryClient({
    // No retries: a test asserting an error state should not wait for backoff.
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export function signedIn() {
  localStorage.setItem('screener.token', 'test.jwt.token')
}
