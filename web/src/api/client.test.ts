import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BASE, errorBody, server } from '../test/server'
import { ApiError, request, setUnauthorizedHandler, tokenStore } from './client'

/** Await a rejection and narrow it, so assertions are type-checked. */
async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError)
    return err as ApiError
  }
  throw new Error('expected the request to reject')
}

describe('api client', () => {
  beforeEach(() => {
    tokenStore.clear()
    setUnauthorizedHandler(() => {})
  })

  it('sends the bearer token when there is one', async () => {
    let seen: string | null = null
    server.use(
      http.get(`${BASE}/api/auth/me`, ({ request: req }) => {
        seen = req.headers.get('Authorization')
        return HttpResponse.json({ id: '1' })
      }),
    )
    tokenStore.set('abc123')
    await request('/api/auth/me')
    expect(seen).toBe('Bearer abc123')
  })

  it('omits the header when signed out', async () => {
    let seen: string | null = 'unset'
    server.use(
      http.get(`${BASE}/api/auth/me`, ({ request: req }) => {
        seen = req.headers.get('Authorization')
        return HttpResponse.json({ id: '1' })
      }),
    )
    await request('/api/auth/me')
    expect(seen).toBeNull()
  })

  it('parses the error envelope into a typed ApiError', async () => {
    server.use(
      http.get(`${BASE}/api/jobs/x`, () =>
        HttpResponse.json(errorBody('JOB_NOT_FOUND', 'No job with id x'), { status: 404 }),
      ),
    )

    const err = await rejection(request('/api/jobs/x'))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('JOB_NOT_FOUND')
    expect(err.status).toBe(404)
    expect(err.traceId).toBe('c1a9f4e2b7d34a10')
  })

  it('surfaces validation details', async () => {
    server.use(
      http.post(`${BASE}/api/jobs`, () =>
        HttpResponse.json(
          errorBody('VALIDATION_FAILED', 'Request validation failed', {
            title: 'must be between 3 and 120 characters',
          }),
          { status: 400 },
        ),
      ),
    )
    const err = await rejection(request('/api/jobs', { method: 'POST', body: {} }))
    expect(err.details).toEqual({ title: 'must be between 3 and 120 characters' })
  })

  // A proxy 502 or an HTML error page must still come out as an ApiError, so
  // callers only ever handle one shape.
  it('turns a non-JSON error response into an ApiError', async () => {
    server.use(
      http.get(`${BASE}/api/jobs`, () =>
        HttpResponse.text('<html>502 Bad Gateway</html>', { status: 502 }),
      ),
    )
    const err = await rejection(request('/api/jobs'))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('INTERNAL_ERROR')
    expect(err.status).toBe(502)
  })

  it('turns a network failure into an ApiError', async () => {
    server.use(http.get(`${BASE}/api/jobs`, () => HttpResponse.error()))
    const err = await rejection(request('/api/jobs'))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
  })

  // The 24h expiry makes this a daily occurrence. Without it the app spins.
  it('clears the token and fires the handler on 401', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    tokenStore.set('expired')

    server.use(
      http.get(`${BASE}/api/jobs`, () =>
        HttpResponse.json(errorBody('UNAUTHORIZED', 'Token expired'), { status: 401 }),
      ),
    )

    await request('/api/jobs').catch(() => {})
    expect(tokenStore.get()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalled()
  })

  it('does not set a JSON content-type for FormData', async () => {
    let contentType: string | null = null
    server.use(
      http.post(`${BASE}/api/jobs/1/resumes`, ({ request: req }) => {
        contentType = req.headers.get('Content-Type')
        return HttpResponse.json({ uploaded: [], rejected: [] })
      }),
    )
    const form = new FormData()
    form.append('files', new File(['x'], 'a.pdf', { type: 'application/pdf' }))
    await request('/api/jobs/1/resumes', { method: 'POST', body: form })

    // The browser must pick the multipart boundary itself.
    expect(contentType).toMatch(/multipart\/form-data/)
  })

  it('aborts a request that exceeds its timeout', async () => {
    server.use(
      http.get(`${BASE}/api/jobs`, async () => {
        await new Promise((r) => setTimeout(r, 50))
        return HttpResponse.json({})
      }),
    )
    const err = await rejection(request('/api/jobs', { timeoutMs: 5 }))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).toMatch(/timed out/i)
  })
})
