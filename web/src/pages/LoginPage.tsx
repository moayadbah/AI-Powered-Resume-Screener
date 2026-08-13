import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { login, register } from '../api/queries'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result =
        mode === 'login'
          ? await login({ email, password })
          : await register({ email, password, fullName })
      signIn(result.token)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? '/jobs', { replace: true })
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <h1>Resume Screener</h1>
      <form onSubmit={onSubmit} className="card">
        <h2>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2>

        {mode === 'register' && (
          <label>
            Full name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              autoComplete="name"
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          className="linkish"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>
  )
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'INVALID_CREDENTIALS':
        // One message for both cases. The server deliberately does not say
        // which was wrong, so it does not leak which addresses have accounts.
        return 'Email or password is incorrect.'
      case 'EMAIL_ALREADY_REGISTERED':
        return 'That email is already registered. Try signing in.'
      case 'VALIDATION_FAILED':
        return err.details
          ? Object.entries(err.details)
              .map(([f, m]) => `${f}: ${m}`)
              .join('. ')
          : 'Please check the form and try again.'
      default:
        return err.message
    }
  }
  return 'Something went wrong. Please try again.'
}
