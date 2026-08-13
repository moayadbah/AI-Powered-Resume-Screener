import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { tokenStore } from '../api/client'
import { BASE, errorBody, server } from '../test/server'
import { renderApp } from '../test/render'
import { LoginPage } from './LoginPage'

async function fillAndSubmit(password = 'devpassword') {
  await userEvent.type(screen.getByLabelText(/email/i), 'me@example.com')
  await userEvent.type(screen.getByLabelText(/password/i), password)
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('LoginPage', () => {
  it('stores the token on success', async () => {
    renderApp(<LoginPage />, { route: '/login' })
    await fillAndSubmit()
    await waitFor(() => expect(tokenStore.get()).toBe('test.jwt.token'))
  })

  /**
   * One message for both cases. The server deliberately does not say which was
   * wrong, so the UI must not imply it knows either - that would leak which
   * addresses have accounts.
   */
  it('shows a single message for bad credentials', async () => {
    renderApp(<LoginPage />, { route: '/login' })
    await fillAndSubmit('wrong')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Email or password is incorrect.')
    expect(alert.textContent).not.toMatch(/no such user|unknown email|user not found/i)
  })

  it('surfaces validation details from the server', async () => {
    server.use(
      http.post(`${BASE}/api/auth/login`, () =>
        HttpResponse.json(
          errorBody('VALIDATION_FAILED', 'Request validation failed', {
            password: 'must be at least 8 characters',
          }),
          { status: 400 },
        ),
      ),
    )
    renderApp(<LoginPage />, { route: '/login' })
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i)
  })

  it('explains a duplicate registration', async () => {
    server.use(
      http.post(`${BASE}/api/auth/register`, () =>
        HttpResponse.json(errorBody('EMAIL_ALREADY_REGISTERED', 'taken'), { status: 409 }),
      ),
    )
    renderApp(<LoginPage />, { route: '/login' })

    await userEvent.click(screen.getByRole('button', { name: /need an account/i }))
    await userEvent.type(screen.getByLabelText(/full name/i), 'Sara Haddad')
    await userEvent.type(screen.getByLabelText(/email/i), 'me@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'devpassword')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already registered/i)
  })

  it('reports an unreachable server instead of hanging', async () => {
    server.use(http.post(`${BASE}/api/auth/login`, () => HttpResponse.error()))
    renderApp(<LoginPage />, { route: '/login' })
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
  })
})
