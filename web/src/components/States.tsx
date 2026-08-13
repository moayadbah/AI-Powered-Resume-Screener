/**
 * Loading / empty / error, in one place.
 *
 * Every data-driven view needs all three plus the partial case. Centralising
 * them is what stops the checklist in docs/06-WEB-DASHBOARD.md being skipped.
 */

import { ApiError } from '../api/client'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  // Fixed height so the layout does not jump when data lands.
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i} />
      ))}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {hint && <p className="state-hint">{hint}</p>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : null
  const message = api?.message ?? (error instanceof Error ? error.message : 'Something went wrong.')

  return (
    <div className="state state-error" role="alert">
      <p className="state-title">{message}</p>
      {api?.details && (
        <ul className="state-details">
          {Object.entries(api.details).map(([field, msg]) => (
            <li key={field}>
              <strong>{field}</strong>: {msg}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
      {/* The traceId is how we find the log line for this exact request. */}
      {api?.traceId && <p className="trace">trace {api.traceId}</p>}
    </div>
  )
}
