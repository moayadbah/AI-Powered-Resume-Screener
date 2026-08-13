/** TanStack Query hooks. All request shapes come from the generated types. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { SCREEN_TIMEOUT_MS, request } from './client'
import type { components } from './types'

type S = components['schemas']

export type Job = S['Job']
export type JobSummary = S['JobSummary']
export type Candidate = S['Candidate']
export type CandidateDetail = S['CandidateDetail']
export type UploadResponse = S['UploadResponse']
export type ScreenResponse = S['ScreenResponse']
export type AuthResponse = S['AuthResponse']
export type ParseStatus = S['ParseStatus']

export const keys = {
  jobs: ['jobs'] as const,
  job: (id: string) => ['jobs', id] as const,
  candidates: (jobId: string, sort: string, order: string) =>
    ['jobs', jobId, 'candidates', sort, order] as const,
  candidate: (resumeId: string) => ['candidates', resumeId] as const,
  me: ['me'] as const,
}

// --- auth ---------------------------------------------------------------

export function login(body: { email: string; password: string }) {
  return request<AuthResponse>('/api/auth/login', { method: 'POST', body })
}

export function register(body: { email: string; password: string; fullName: string }) {
  return request<AuthResponse>('/api/auth/register', { method: 'POST', body })
}

export function useMe(enabled: boolean) {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => request<S['User']>('/api/auth/me'),
    enabled,
    retry: false,
  })
}

// --- jobs ---------------------------------------------------------------

export function useJobs(page = 0, size = 20) {
  return useQuery({
    queryKey: [...keys.jobs, page, size],
    queryFn: () => request<S['JobSummaryPage']>(`/api/jobs?page=${page}&size=${size}`),
  })
}

export function useJob(id: string) {
  return useQuery({
    queryKey: keys.job(id),
    queryFn: () => request<Job>(`/api/jobs/${id}`),
  })
}

export function useCreateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: S['CreateJobRequest']) =>
      request<Job>('/api/jobs', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.jobs }),
  })
}

// --- resumes ------------------------------------------------------------

export function useUploadResumes(jobId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData()
      // Field name is `files`, repeated - see the contract.
      files.forEach((f) => form.append('files', f))
      return request<UploadResponse>(`/api/jobs/${jobId}/resumes`, {
        method: 'POST',
        body: form,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.job(jobId) })
      qc.invalidateQueries({ queryKey: ['jobs', jobId, 'candidates'] })
    },
  })
}

// --- screening ----------------------------------------------------------

export function useScreenJob(jobId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      request<ScreenResponse>(`/api/jobs/${jobId}/screen`, {
        method: 'POST',
        // Synchronous on the server; budget 1-2 s per resume.
        timeoutMs: SCREEN_TIMEOUT_MS,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.job(jobId) })
      qc.invalidateQueries({ queryKey: ['jobs', jobId, 'candidates'] })
    },
  })
}

// --- candidates ---------------------------------------------------------

export function useCandidates(
  jobId: string,
  sort: 'score' | 'name' | 'uploadedAt' = 'score',
  order: 'asc' | 'desc' = 'desc',
) {
  return useQuery({
    queryKey: keys.candidates(jobId, sort, order),
    queryFn: () =>
      request<S['CandidatePage']>(
        `/api/jobs/${jobId}/candidates?sort=${sort}&order=${order}&page=0&size=100`,
      ),
  })
}

export function useCandidate(resumeId: string) {
  return useQuery({
    queryKey: keys.candidate(resumeId),
    queryFn: () => request<CandidateDetail>(`/api/candidates/${resumeId}`),
  })
}
