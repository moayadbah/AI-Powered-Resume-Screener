/**
 * The ranked list.
 *
 * Unreadable resumes stay visible with an explanation. Hiding them is how a
 * candidate silently disappears, and the recruiter is the only one who can fix
 * it - by asking for a different file.
 */

import { Link } from 'react-router-dom'

import type { Candidate } from '../api/queries'
import { ScoreBadge } from './ScoreBadge'

export type SortKey = 'score' | 'name' | 'uploadedAt'
export type SortOrder = 'asc' | 'desc'

interface Props {
  candidates: Candidate[]
  sort: SortKey
  order: SortOrder
  onSortChange: (sort: SortKey) => void
}

const UNREADABLE: Record<string, string> = {
  EMPTY: 'No readable text — likely a scanned PDF',
  FAILED: 'Could not read this file',
}

function statusNote(c: Candidate): string | null {
  if (c.parseStatus && c.parseStatus !== 'PARSED') {
    return UNREADABLE[c.parseStatus] ?? 'Unreadable'
  }
  if (!c.screening) return 'Not screened yet'
  return null
}

export function CandidateTable({ candidates, sort, order, onSortChange }: Props) {
  const arrow = (key: SortKey) => (sort === key ? (order === 'desc' ? ' ▼' : ' ▲') : '')

  // Rank only counts scored rows, so unscreened ones do not consume positions.
  // Computed up front rather than by mutating a counter during render, which is
  // unsafe if React re-renders part of the list.
  const ranks = new Map<string, number>()
  candidates
    .filter((c) => c.screening)
    .forEach((c, i) => ranks.set(c.resumeId, i + 1))

  return (
    <table className="candidates">
      <caption className="visually-hidden">
        Candidates ranked by match score. Resumes we could not read are listed with a reason.
      </caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">
            <button type="button" onClick={() => onSortChange('name')}>
              Candidate{arrow('name')}
            </button>
          </th>
          <th scope="col">
            <button type="button" onClick={() => onSortChange('score')}>
              Score{arrow('score')}
            </button>
          </th>
          <th scope="col">Skills</th>
          <th scope="col">
            <button type="button" onClick={() => onSortChange('uploadedAt')}>
              Uploaded{arrow('uploadedAt')}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {candidates.map((c) => {
          const note = statusNote(c)
          const s = c.screening
          const rank = ranks.get(c.resumeId)

          return (
            <tr key={c.resumeId} className={note ? 'row-muted' : undefined}>
              <td>{rank ?? '—'}</td>
              <td>
                <Link to={`/candidates/${c.resumeId}`}>{c.candidateName}</Link>
                <div className="filename">{c.originalFilename}</div>
                {note && <div className="note">{note}</div>}
              </td>
              <td>{s ? <ScoreBadge score={s.score} /> : <span className="dash">—</span>}</td>
              <td>
                {s ? (
                  <span className="skill-counts">
                    <span className="matched">{s.matchedSkills.length} matched</span>
                    {s.missingSkills.length > 0 && (
                      <span className="missing">{s.missingSkills.length} missing</span>
                    )}
                  </span>
                ) : (
                  <span className="dash">—</span>
                )}
              </td>
              <td>{new Date(c.uploadedAt).toLocaleDateString()}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
