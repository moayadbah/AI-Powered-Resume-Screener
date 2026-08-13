import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { BASE, CANDIDATES, errorBody, server } from '../test/server'
import { renderApp, signedIn } from '../test/render'
import { JobDetailPage } from './JobDetailPage'

function renderPage() {
  signedIn()
  return renderApp(
    <Routes>
      <Route path="/jobs/:jobId" element={<JobDetailPage />} />
    </Routes>,
    { route: `/jobs/665f1a2b3c4d5e6f70819201` },
  )
}

describe('JobDetailPage', () => {
  it('shows a loading state before data arrives', () => {
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders the job and its required skills', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: /backend engineer/i })).toBeInTheDocument()
    expect(screen.getByText('spring boot')).toBeInTheDocument()
  })

  // All four row states must be visible. Hiding unreadable resumes is how a
  // candidate silently disappears.
  it('renders scored, unscreened, and unreadable rows together', async () => {
    renderPage()
    expect(await screen.findByText('Omar Khalil')).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()

    expect(screen.getByText('Rana Odeh')).toBeInTheDocument()
    expect(screen.getByText('Not screened yet')).toBeInTheDocument()

    expect(screen.getByText('scanned_cv')).toBeInTheDocument()
    expect(screen.getByText(/no readable text/i)).toBeInTheDocument()
  })

  it('ranks only scored rows', async () => {
    renderPage()
    await screen.findByText('Omar Khalil')
    const rows = screen.getAllByRole('row').slice(1)
    // First row is rank 1; the unscored ones show a dash.
    expect(rows[0]).toHaveTextContent('1')
    expect(rows[1]).toHaveTextContent('—')
  })

  it('reports counts after screening', async () => {
    renderPage()
    await screen.findByText('Omar Khalil')

    await userEvent.click(screen.getByRole('button', { name: /screen all/i }))

    expect(await screen.findByText(/screened 2 resumes/i)).toBeInTheDocument()
    expect(screen.getByText(/skipped 1 we could not read/i)).toBeInTheDocument()
  })

  // Degraded summaries are normal, not an error - the wording must not imply
  // the scores are suspect.
  it('calls out degraded summaries without implying the scores are wrong', async () => {
    server.use(
      http.post(`${BASE}/api/jobs/:id/screen`, () =>
        HttpResponse.json({
          jobId: '1',
          screened: 2,
          skipped: 0,
          summariesDegraded: 2,
          modelVersion: 'all-MiniLM-L6-v2@1110a24',
          durationMs: 900,
          screenedAt: '2026-08-12T09:35:02Z',
        }),
      ),
    )
    renderPage()
    await screen.findByText('Omar Khalil')
    await userEvent.click(screen.getByRole('button', { name: /screen all/i }))

    expect(await screen.findByText(/2 summaries are unavailable/i)).toBeInTheDocument()
    expect(screen.getByText(/scores were not affected/i)).toBeInTheDocument()
  })

  it('explains NO_SCOREABLE_RESUMES in plain language', async () => {
    server.use(
      http.post(`${BASE}/api/jobs/:id/screen`, () =>
        HttpResponse.json(errorBody('NO_SCOREABLE_RESUMES', 'nothing to score'), {
          status: 422,
        }),
      ),
    )
    renderPage()
    await screen.findByText('Omar Khalil')
    await userEvent.click(screen.getByRole('button', { name: /screen all/i }))

    expect(
      await screen.findByText(/none of the uploaded files had readable text/i),
    ).toBeInTheDocument()
  })

  it('disables the screen button and explains the wait while running', async () => {
    // Delay the response, otherwise the mutation resolves before the pending
    // state can be observed and the test proves nothing.
    server.use(
      http.post(`${BASE}/api/jobs/:id/screen`, async () => {
        await new Promise((r) => setTimeout(r, 100))
        return HttpResponse.json({
          jobId: '1',
          screened: 2,
          skipped: 0,
          summariesDegraded: 0,
          modelVersion: 'all-MiniLM-L6-v2@1110a24',
          durationMs: 100,
          screenedAt: '2026-08-12T09:35:02Z',
        })
      }),
    )

    renderPage()
    await screen.findByText('Omar Khalil')
    const button = screen.getByRole('button', { name: /screen all/i })
    await userEvent.click(button)

    expect(button).toBeDisabled()
    // Honest progress text rather than a fake percentage - the request is
    // synchronous, so there is nothing to poll.
    expect(await screen.findByText(/this can take a minute/i)).toBeInTheDocument()

    await waitFor(() => expect(button).toBeEnabled())
  })

  it('shows an empty state when there are no candidates', async () => {
    server.use(
      http.get(`${BASE}/api/jobs/:id/candidates`, () =>
        HttpResponse.json({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 1 }),
      ),
    )
    renderPage()
    expect(await screen.findByText(/no candidates yet/i)).toBeInTheDocument()
  })

  it('shows an error state with the traceId', async () => {
    server.use(
      http.get(`${BASE}/api/jobs/:id`, () =>
        HttpResponse.json(errorBody('JOB_NOT_FOUND', 'No such job'), { status: 404 }),
      ),
    )
    renderPage()
    expect(await screen.findByText('No such job')).toBeInTheDocument()
    expect(screen.getByText(/c1a9f4e2b7d34a10/)).toBeInTheDocument()
  })

  it('offers a keyboard-reachable file input, not drag-only', async () => {
    renderPage()
    await screen.findByText('Omar Khalil')
    const input = document.querySelector('input[type="file"]')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('multiple')
  })

  it('does not send files the server would reject anyway', async () => {
    renderPage()
    await screen.findByText('Omar Khalil')

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    // applyAccept: false because the `accept` attribute filters this out in the
    // picker. Drag-and-drop bypasses that filter, which is exactly why the
    // client-side check exists.
    await userEvent.upload(
      input,
      new File(['x'], 'notes.docx', { type: 'application/msword' }),
      { applyAccept: false },
    )

    expect(await screen.findByText(/notes\.docx: not a PDF/i)).toBeInTheDocument()
  })

  it('rejects an oversized PDF before uploading', async () => {
    renderPage()
    await screen.findByText('Omar Khalil')

    const big = new File(['x'], 'huge.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, big, { applyAccept: false })

    expect(await screen.findByText(/huge\.pdf: over 5 MB/i)).toBeInTheDocument()
  })

  it('renders all three charts once there are candidates', async () => {
    renderPage()
    await screen.findByText('Omar Khalil')
    expect(screen.getByText('Score distribution')).toBeInTheDocument()
    expect(screen.getByText('Top candidates')).toBeInTheDocument()
    expect(screen.getByText('Skill coverage')).toBeInTheDocument()
  })

  it('sorts through the server, not in the browser', async () => {
    let lastQuery = ''
    server.use(
      http.get(`${BASE}/api/jobs/:id/candidates`, ({ request }) => {
        lastQuery = new URL(request.url).search
        return HttpResponse.json({
          content: CANDIDATES,
          page: 0,
          size: 100,
          totalElements: 3,
          totalPages: 1,
        })
      }),
    )
    renderPage()
    await screen.findByText('Omar Khalil')

    await userEvent.click(screen.getByRole('button', { name: /candidate/i }))
    await waitFor(() => expect(lastQuery).toContain('sort=name'))
  })
})
