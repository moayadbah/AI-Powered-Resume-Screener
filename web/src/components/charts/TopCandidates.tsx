/** Top 10 by score. The chart people actually look at. */

import { Bar } from 'react-chartjs-2'
import { useNavigate } from 'react-router-dom'

import type { Candidate } from '../../api/queries'
import { BASE_OPTIONS } from './setup'

export function topTen(candidates: Candidate[]): Candidate[] {
  return candidates
    .filter((c) => c.screening)
    .sort((a, b) => (b.screening?.score ?? 0) - (a.screening?.score ?? 0))
    .slice(0, 10)
}

export function TopCandidates({ candidates }: { candidates: Candidate[] }) {
  const navigate = useNavigate()
  const top = topTen(candidates)

  return (
    <figure className="chart">
      <figcaption>Top candidates</figcaption>
      <div className="chart-canvas">
        <Bar
          aria-hidden="true"
          options={{
            ...BASE_OPTIONS,
            indexAxis: 'y' as const,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, max: 100 } },
            onClick: (_evt, elements) => {
              const index = elements[0]?.index
              const picked = index === undefined ? undefined : top[index]
              if (picked) navigate(`/candidates/${picked.resumeId}`)
            },
          }}
          data={{
            labels: top.map((c) => c.candidateName),
            datasets: [
              {
                label: 'Score',
                data: top.map((c) => c.screening?.score ?? 0),
                backgroundColor: '#5aa17f',
              },
            ],
          }}
        />
      </div>
      <p className="chart-alt">Select a candidate in the table below for details.</p>
    </figure>
  )
}
