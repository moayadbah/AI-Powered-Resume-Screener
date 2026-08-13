/**
 * Percentage of candidates who have each required skill.
 *
 * Answers a different question from the other two: not "who is best" but "is
 * this requirement realistic". A skill at 5% usually means the job description
 * asks for something the market does not have.
 */

import { Radar } from 'react-chartjs-2'

import type { Candidate } from '../../api/queries'
import { BASE_OPTIONS } from './setup'

/** Radar labels overlap into mush past about 8 axes. */
const MAX_AXES = 8

export function coverage(
  candidates: Candidate[],
  requiredSkills: string[],
): { skill: string; percent: number }[] {
  const scored = candidates.filter((c) => c.screening)
  if (scored.length === 0) return []

  return requiredSkills
    .map((skill) => {
      const have = scored.filter((c) => c.screening?.matchedSkills.includes(skill)).length
      return { skill, percent: Math.round((have / scored.length) * 100) }
    })
    // Keep the highest-variance axes: the ones furthest from unanimous.
    .sort((a, b) => Math.abs(50 - a.percent) - Math.abs(50 - b.percent))
    .slice(0, MAX_AXES)
}

export function SkillCoverage({
  candidates,
  requiredSkills,
}: {
  candidates: Candidate[]
  requiredSkills: string[]
}) {
  const rows = coverage(candidates, requiredSkills)

  if (rows.length === 0) {
    return (
      <figure className="chart">
        <figcaption>Skill coverage</figcaption>
        <p className="state-hint">Screen the resumes to see skill coverage.</p>
      </figure>
    )
  }

  return (
    <figure className="chart">
      <figcaption>Skill coverage</figcaption>
      <div className="chart-canvas">
        <Radar
          aria-hidden="true"
          options={{
            ...BASE_OPTIONS,
            plugins: { legend: { display: false } },
            scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 25 } } },
          }}
          data={{
            labels: rows.map((r) => r.skill),
            datasets: [
              {
                label: '% of candidates',
                data: rows.map((r) => r.percent),
                backgroundColor: 'rgba(107, 138, 253, 0.25)',
                borderColor: '#6b8afd',
              },
            ],
          }}
        />
      </div>
      <ul className="chart-alt">
        {rows.map((r) => (
          <li key={r.skill}>
            {r.skill}: {r.percent}%
          </li>
        ))}
      </ul>
    </figure>
  )
}
