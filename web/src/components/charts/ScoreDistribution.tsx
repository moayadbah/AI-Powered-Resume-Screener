/**
 * Counts per 10-point bucket.
 *
 * Shows shape: whether the pile is genuinely differentiated, or everything
 * clustered at 55 - which usually means the job description is too generic.
 */

import { Bar } from 'react-chartjs-2'

import type { Candidate } from '../../api/queries'
import { BASE_OPTIONS } from './setup'

export function bucketScores(candidates: Candidate[]): number[] {
  const buckets = new Array<number>(10).fill(0)
  for (const c of candidates) {
    if (!c.screening) continue
    // 100 belongs in the top bucket, not an 11th.
    const i = Math.min(9, Math.floor(c.screening.score / 10))
    buckets[i] = (buckets[i] ?? 0) + 1
  }
  return buckets
}

const LABELS = Array.from({ length: 10 }, (_, i) => `${i * 10}-${i * 10 + 9}`)

export function ScoreDistribution({ candidates }: { candidates: Candidate[] }) {
  const data = bucketScores(candidates)

  return (
    <figure className="chart">
      <figcaption>Score distribution</figcaption>
      <div className="chart-canvas">
        <Bar
          aria-hidden="true"
          options={{
            ...BASE_OPTIONS,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
          }}
          data={{
            labels: LABELS,
            datasets: [{ label: 'Candidates', data, backgroundColor: '#6b8afd' }],
          }}
        />
      </div>
      <p className="chart-alt">
        The candidate table below lists the same scores individually.
      </p>
    </figure>
  )
}
