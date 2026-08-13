import { Link, useParams } from 'react-router-dom'

import { useCandidate } from '../api/queries'
import { ScoreBadge } from '../components/ScoreBadge'
import { ErrorState, Loading } from '../components/States'

export function CandidateDetailPage() {
  const { resumeId = '' } = useParams()
  const { data, isPending, isError, error, refetch } = useCandidate(resumeId)

  if (isPending) return <Loading label="Loading candidate…" />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const s = data.screening

  return (
    <main className="page">
      <Link to={`/jobs/${data.jobId}`} className="back">
        ← {data.jobTitle}
      </Link>

      <header className="page-head">
        <div>
          <h1>{data.candidateName}</h1>
          {data.candidateEmail && (
            <p className="muted">
              <a href={`mailto:${data.candidateEmail}`}>{data.candidateEmail}</a>
            </p>
          )}
          <p className="muted">
            {data.originalFilename} · {data.pageCount} page
            {data.pageCount === 1 ? '' : 's'}
          </p>
        </div>
        {s && <ScoreBadge score={s.score} />}
      </header>

      {!s && (
        <div className="state state-empty">
          <p className="state-title">
            {data.parseStatus === 'PARSED'
              ? 'Not screened yet.'
              : data.parseStatus === 'EMPTY'
                ? 'No readable text — likely a scanned PDF.'
                : 'We could not read this file.'}
          </p>
        </div>
      )}

      {s && (
        <>
          <section className="card">
            <h2>Match breakdown</h2>
            <dl className="breakdown">
              <div>
                <dt>Semantic similarity</dt>
                <dd>{Math.round(s.semanticScore * 100)}%</dd>
              </div>
              <div>
                <dt>Skill overlap</dt>
                <dd>{Math.round(s.skillScore * 100)}%</dd>
              </div>
            </dl>

            <h3>Skills found</h3>
            <ul className="chips">
              {s.matchedSkills.length === 0 && <li className="muted">None of the required skills</li>}
              {s.matchedSkills.map((skill) => (
                <li key={skill} className="chip chip-matched">
                  {skill}
                </li>
              ))}
            </ul>

            <h3>Not found in the resume</h3>
            <ul className="chips">
              {s.missingSkills.length === 0 && <li className="muted">Nothing missing</li>}
              {s.missingSkills.map((skill) => (
                <li key={skill} className="chip chip-missing">
                  {skill}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Summary</h2>
            {s.summaryDegraded || !s.summary ? (
              /* The second sentence is load-bearing: a blank summary must not
                 cast doubt on the score sitting next to it. */
              <p className="muted">
                Summary unavailable — the local model did not respond. Scoring was not
                affected.
              </p>
            ) : (
              <>
                <p>{s.summary}</p>
                {s.strengths && s.strengths.length > 0 && (
                  <>
                    <h3>Strengths</h3>
                    <ul className="bullets">
                      {s.strengths.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </>
                )}
                {s.concerns && s.concerns.length > 0 && (
                  <>
                    <h3>Things to check</h3>
                    <ul className="bullets">
                      {s.concerns.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>

          <p className="provenance">
            Scored {new Date(s.scoredAt).toLocaleString()} with {s.modelVersion}
            {s.promptVersion && ` · prompt ${s.promptVersion}`}
          </p>
        </>
      )}
    </main>
  )
}
