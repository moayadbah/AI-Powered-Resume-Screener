/**
 * The only place fetch is called.
 *
 * Shapes come from src/api/types.ts, which is generated from
 * docs/contracts/api-service.openapi.yaml - never hand-write them.
 */

import type { components } from './types'

type Schemas = components['schemas']

export type ErrorCode = NonNullable<Schemas['ErrorResponse']['error']>['code']

/** Typed failure. Branch on `code`, never on message text. */
export class ApiError extends Error {
  readonly code: ErrorCode | 'INTERNAL_ERROR'
  readonly traceId: string | null
  readonly status: number
  readonly details: Record<string, string> | null

  constructor(init: {
    code: ErrorCode | 'INTERNAL_ERROR'
    message: string
    traceId?: string | null
    status: number
    details?: Record<string, string> | null
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.code = init.code
    this.traceId = init.traceId ?? null
    this.status = init.status
    this.details = init.details ?? null
  }
}

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

const TOKEN_KEY = 'screener.token'

/**
 * localStorage is XSS-readable. The right answer is an httpOnly cookie, which
 * needs CSRF handling the local compose setup does not have - a knowing
 * tradeoff for a local tool, recorded in docs/06-WEB-DASHBOARD.md rather than
 * pretended away.
 */
export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

/** Called on any 401 so the app can bounce to /login. Set once at startup. */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

const DEFAULT_TIMEOUT_MS = 30_000
/** Screening is synchronous and can legitimately run over a minute. */
export const SCREEN_TIMEOUT_MS = 180_000

interface RequestOptions {
  method?: string
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = opts

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  opts.signal?.addEventListener('abort', () => controller.abort())

  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  let init: RequestInit = { method, headers, signal: controller.signal }
  if (body instanceof FormData) {
    // Let the browser set the multipart boundary.
    init = { ...init, body }
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init = { ...init, body: JSON.stringify(body) }
  }

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, init)
  } catch {
    clearTimeout(timer)
    if (controller.signal.aborted) {
      throw new ApiError({
        code: 'INTERNAL_ERROR',
        message: 'The request timed out. The server may still be working.',
        status: 0,
      })
    }
    throw new ApiError({
      code: 'INTERNAL_ERROR',
      message: 'Could not reach the server. Is it running?',
      status: 0,
    })
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401) {
    tokenStore.clear()
    onUnauthorized?.()
  }

  if (!response.ok) {
    throw await toApiError(response)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/**
 * Parse the envelope from docs/03-API-CONTRACT.md.
 *
 * A proxy 502 or an HTML error page still has to come out as an ApiError, so
 * callers only ever handle one shape.
 */
async function toApiError(response: Response): Promise<ApiError> {
  try {
    const payload = (await response.json()) as Schemas['ErrorResponse']
    const err = payload?.error
    if (err?.code) {
      return new ApiError({
        code: err.code,
        message: err.message ?? 'Request failed',
        traceId: err.traceId ?? null,
        status: response.status,
        details: (err.details as Record<string, string> | undefined) ?? null,
      })
    }
  } catch {
    // Not JSON. Fall through to the generic error below.
  }
  return new ApiError({
    code: 'INTERNAL_ERROR',
    message: `Request failed (HTTP ${response.status})`,
    status: response.status,
  })
}
