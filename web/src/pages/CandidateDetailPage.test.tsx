import { screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { BASE, server } from '../test/server'
import { renderApp, signedIn } from '../test/render'
import { CandidateDetailPage } from './CandidateDetailPage'

const RESUME_ID = '665f1a2b3c4d5e6f70819210'

function renderPage() {
  signedIn()
  return renderApp(
    <Routes>
      <Route path="/candidates/:resumeId" element={<CandidateDetailPage />} />
    </Routes>,
    { route: `/candidates/${RESUME_ID}` },
  )
}

const BASE_SCREENING = {
  score: 82,
  semanticScore: 0.7913,
  skillScore: 0.8,
  matchedSkills: ['java'],
  missingSkills: ['rest api'],
  summaryDegraded: false,
  scoredAt: '2026-08-12T09:35:02Z',
  modelVersion: 'all-MiniLM-L6-v2@1110a24',
  promptVersion: 'v1',
  weights: { semantic: 0.7, skill: 0.3 },
}

function candidate(screening: unknown) {
  return {
    resumeId: RESUME_ID,
    jobId: '665f1a2b3c4d5e6f70819201',
    jobTitle: 'Backend Engineer (Java)',
    candidateName: 'Omar Khalil',
    candidateEmail: 'omar.khalil@example.com',
    originalFilename: 'Omar_Khalil_CV.pdf',
    parseStatus: 'PARSED',
    pageCount: 2,
    uploadedAt: '2026-08-12T09:31:47Z',
    screening,
  }
}

describe('CandidateDetailPage', () => {
  it('shows the score, breakdown, and skills', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Omar Khalil' })).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText('79%')).toBeInTheDocument() // semantic
    expect(screen.getByText('80%')).toBeInTheDocument() // skill
    expect(screen.getByText('rest api')).toBeInTheDocument()
  })

  it('shows the summary prose', async () => {
    renderPage()
    expect(await screen.findByText(/strong java backend background/i)).toBeInTheDocument()
    expect(screen.getByText(/4 years spring boot in production/i)).toBeInTheDocument()
  })

  /**
   * The key wording rule: a blank summary must not cast doubt on the score
   * sitting next to it.
   */
  it('says scoring was unaffected when the summary is degraded', async () => {
    server.use(
      http.get(`${BASE}/api/candidates/:id`, () =>
        HttpResponse.json(
          candidate({ ...BASE_SCREENING, summary: null, summaryDegraded: true }),
        ),
      ),
    )
    renderPage()

    expect(await screen.findByText(/summary unavailable/i)).toBeInTheDocument()
    expect(screen.getByText(/scoring was not affected/i)).toBeInTheDocument()
    // The score is still shown normally.
    expect(screen.getByText('82')).toBeInTheDocument()
  })

  it('handles a resume that has not been screened', async () => {
    server.use(
      http.get(`${BASE}/api/candidates/:id`, () => HttpResponse.json(candidate(null))),
    )
    renderPage()
    expect(await screen.findByText(/not screened yet/i)).toBeInTheDocument()
  })

  it('explains an unreadable scan', async () => {
    server.use(
      http.get(`${BASE}/api/candidates/:id`, () =>
        HttpResponse.json({ ...candidate(null), parseStatus: 'EMPTY' }),
      ),
    )
    renderPage()
    expect(await screen.findByText(/likely a scanned PDF/i)).toBeInTheDocument()
  })

  it('records which model produced the score', async () => {
    renderPage()
    expect(await screen.findByText(/all-MiniLM-L6-v2@1110a24/)).toBeInTheDocument()
    expect(screen.getByText(/prompt v1/)).toBeInTheDocument()
  })
})
