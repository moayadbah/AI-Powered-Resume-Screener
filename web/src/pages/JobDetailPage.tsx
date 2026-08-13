import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import {
  useCandidates,
  useJob,
  useScreenJob,
  useUploadResumes,
  type ScreenResponse,
} from '../api/queries'
import { CandidateTable, type SortKey, type SortOrder } from '../components/CandidateTable'
import { ScoreDistribution } from '../components/charts/ScoreDistribution'
import { SkillCoverage } from '../components/charts/SkillCoverage'
import { TopCandidates } from '../components/charts/TopCandidates'
import { EmptyState, ErrorState, Loading, SkeletonRows } from '../components/States'
import { UploadDropzone } from '../components/UploadDropzone'

export function JobDetailPage() {
  const { jobId = '' } = useParams()
  const [sort, setSort] = useState<SortKey>('score')
  const [order, setOrder] = useState<SortOrder>('desc')
  const [result, setResult] = useState<ScreenResponse | null>(null)

  const job = useJob(jobId)
  const candidates = useCandidates(jobId, sort, order)
  const upload = useUploadResumes(jobId)
  const screen = useScreenJob(jobId)

  function toggleSort(key: SortKey) {
    if (key === sort) setOrder(order === 'desc' ? 'asc' : 'desc')
    else {
      setSort(key)
      setOrder(key === 'name' ? 'asc' : 'desc')
    }
  }

  if (job.isPending) return <Loading label="Loading job…" />
  if (job.isError) return <ErrorState error={job.error} onRetry={() => void job.refetch()} />

  const rows = candidates.data?.content ?? []
  const scoreable = rows.filter((c) => c.parseStatus === 'PARSED').length

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>{job.data.title}</h1>
          {job.data.location && <p className="muted">{job.data.location}</p>}
          <ul className="chips">
            {job.data.requiredSkills.map((s) => (
              <li key={s} className="chip">
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="screen-action">
          <button
            type="button"
            disabled={screen.isPending || scoreable === 0}
            onClick={() =>
              screen.mutate(undefined, { onSuccess: (data) => setResult(data) })
            }
          >
            {screen.isPending ? 'Screening…' : 'Screen all'}
          </button>

          {/* No progress to poll - the request is synchronous - so say what is
              happening and roughly how long rather than faking a percentage. */}
          {screen.isPending && (
            <p className="muted" role="status">
              Screening {scoreable} resume{scoreable === 1 ? '' : 's'}. This can take a
              minute.
            </p>
          )}
        </div>
      </header>

      {screen.isError && <ScreenError error={screen.error} />}
      {result && !screen.isPending && <ScreenSummary result={result} />}

      <UploadDropzone busy={upload.isPending} onUpload={(files) => upload.mutate(files)} />
      {upload.isError && <ErrorState error={upload.error} />}
      {upload.data && upload.data.rejected.length > 0 && (
        <ul className="form-error" role="alert">
          {upload.data.rejected.map((r) => (
            <li key={r.filename}>
              {r.filename}: {r.reason === 'UNSUPPORTED_FILE_TYPE' ? 'not a PDF' : 'too large'}
            </li>
          ))}
        </ul>
      )}

      {candidates.isPending && <SkeletonRows />}
      {candidates.isError && (
        <ErrorState error={candidates.error} onRetry={() => void candidates.refetch()} />
      )}

      {rows.length === 0 && !candidates.isPending && (
        <EmptyState title="No candidates yet" hint="Upload resumes to get started." />
      )}

      {rows.length > 0 && (
        <>
          <section className="charts">
            <ScoreDistribution candidates={rows} />
            <TopCandidates candidates={rows} />
            <SkillCoverage candidates={rows} requiredSkills={job.data.requiredSkills} />
          </section>

          <CandidateTable
            candidates={rows}
            sort={sort}
            order={order}
            onSortChange={toggleSort}
          />
        </>
      )}
    </main>
  )
}

function ScreenError({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.code === 'NO_SCOREABLE_RESUMES') {
    return (
      <div className="state state-error" role="alert">
        <p className="state-title">None of the uploaded files had readable text.</p>
        <p className="state-hint">
          They are listed below with a reason. Scanned PDFs have no text layer — ask for a
          text version.
        </p>
      </div>
    )
  }
  return <ErrorState error={error} />
}

function ScreenSummary({ result }: { result: ScreenResponse }) {
  return (
    <div className="state state-ok" role="status">
      <p>
        Screened {result.screened} resume{result.screened === 1 ? '' : 's'}
        {result.skipped > 0 && `, skipped ${result.skipped} we could not read`}.
      </p>
      {result.summariesDegraded > 0 && (
        <p className="state-hint">
          {result.summariesDegraded} summar
          {result.summariesDegraded === 1 ? 'y is' : 'ies are'} unavailable — the local model
          did not respond. Scores were not affected.
        </p>
      )}
    </div>
  )
}
