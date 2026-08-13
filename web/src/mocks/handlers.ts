/**
 * MSW handlers, shared by the test suite and the browser dev mocks.
 *
 * Platform-neutral on purpose: importing msw/node here would drag Node-only
 * code into the browser bundle.
 *
 * Response bodies are copied from the examples in docs/03-API-CONTRACT.md.
 * Writing them from memory is how a mock drifts from the real API and both
 * suites pass while the system is broken.
 */

import { HttpResponse, http } from 'msw'

export const BASE = 'http://localhost:8080'

export const JOB = {
  id: '665f1a2b3c4d5e6f70819201',
  title: 'Backend Engineer (Java)',
  description: 'We are hiring a backend engineer to design, build and maintain the REST APIs.',
  requiredSkills: ['java', 'spring boot', 'mongodb', 'docker', 'rest api'],
  location: 'Amman, Jordan',
  createdAt: '2026-08-12T09:20:11Z',
  updatedAt: '2026-08-12T09:20:11Z',
  resumeCount: 3,
  screenedCount: 2,
  unreadableCount: 1,
  lastScreenedAt: '2026-08-12T09:35:02Z',
}

/** One of each row state: screened, unscreened-but-parsed, and unreadable. */
export const CANDIDATES = [
  {
    resumeId: '665f1a2b3c4d5e6f70819210',
    candidateName: 'Omar Khalil',
    candidateEmail: 'omar.khalil@example.com',
    originalFilename: 'Omar_Khalil_CV.pdf',
    parseStatus: 'PARSED' as const,
    uploadedAt: '2026-08-12T09:31:47Z',
    screening: {
      score: 82,
      semanticScore: 0.7913,
      skillScore: 0.8,
      matchedSkills: ['java', 'spring boot', 'mongodb', 'docker'],
      missingSkills: ['rest api'],
      summaryDegraded: false,
      scoredAt: '2026-08-12T09:35:02Z',
    },
  },
  {
    resumeId: '665f1a2b3c4d5e6f70819212',
    candidateName: 'Rana Odeh',
    candidateEmail: null,
    originalFilename: 'rana.pdf',
    parseStatus: 'PARSED' as const,
    uploadedAt: '2026-08-12T09:31:50Z',
    screening: null,
  },
  {
    resumeId: '665f1a2b3c4d5e6f70819211',
    candidateName: 'scanned_cv',
    candidateEmail: null,
    originalFilename: 'scanned_cv.pdf',
    parseStatus: 'EMPTY' as const,
    uploadedAt: '2026-08-12T09:31:48Z',
    screening: null,
  },
]

export function errorBody(code: string, message: string, details: unknown = null) {
  return { error: { code, message, traceId: 'c1a9f4e2b7d34a10', details } }
}

export const handlers = [
  http.post(`${BASE}/api/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    if (body.password === 'wrong') {
      return HttpResponse.json(
        errorBody('INVALID_CREDENTIALS', 'Email or password is incorrect.'),
        { status: 401 },
      )
    }
    return HttpResponse.json({
      token: 'test.jwt.token',
      expiresAt: '2026-08-13T09:14:03Z',
      user: {
        id: '665f1a2b3c4d5e6f70819200',
        email: body.email,
        fullName: 'Sara Haddad',
        role: 'RECRUITER',
      },
    })
  }),

  http.get(`${BASE}/api/jobs`, () =>
    HttpResponse.json({
      content: [
        {
          id: JOB.id,
          title: JOB.title,
          location: JOB.location,
          requiredSkills: JOB.requiredSkills,
          createdAt: JOB.createdAt,
          resumeCount: JOB.resumeCount,
          screenedCount: JOB.screenedCount,
        },
      ],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    }),
  ),

  http.get(`${BASE}/api/jobs/:id`, () => HttpResponse.json(JOB)),

  http.get(`${BASE}/api/jobs/:id/candidates`, () =>
    HttpResponse.json({
      content: CANDIDATES,
      page: 0,
      size: 100,
      totalElements: CANDIDATES.length,
      totalPages: 1,
    }),
  ),

  http.post(`${BASE}/api/jobs/:id/screen`, () =>
    HttpResponse.json({
      jobId: JOB.id,
      screened: 2,
      skipped: 1,
      summariesDegraded: 0,
      modelVersion: 'all-MiniLM-L6-v2@1110a24',
      durationMs: 14320,
      screenedAt: '2026-08-12T09:35:02Z',
    }),
  ),

  http.get(`${BASE}/api/candidates/:resumeId`, () =>
    HttpResponse.json({
      resumeId: CANDIDATES[0]!.resumeId,
      jobId: JOB.id,
      jobTitle: JOB.title,
      candidateName: 'Omar Khalil',
      candidateEmail: 'omar.khalil@example.com',
      originalFilename: 'Omar_Khalil_CV.pdf',
      parseStatus: 'PARSED',
      pageCount: 2,
      uploadedAt: '2026-08-12T09:31:47Z',
      screening: {
        ...CANDIDATES[0]!.screening,
        summary: 'Strong Java backend background with four years on Spring Boot services.',
        strengths: ['4 years Spring Boot in production'],
        concerns: ['No explicit API design ownership'],
        modelVersion: 'all-MiniLM-L6-v2@1110a24',
        promptVersion: 'v1',
        weights: { semantic: 0.7, skill: 0.3 },
      },
    }),
  ),
]
