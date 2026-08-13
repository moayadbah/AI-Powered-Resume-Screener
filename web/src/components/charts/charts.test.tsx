/**
 * Charts are tested on the data they hand to Chart.js, not the rendered canvas
 * - see docs/08-TESTING.md. react-chartjs-2 is stubbed via test.alias.
 */

import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Candidate } from '../../api/queries'
import { CANDIDATES } from '../../test/server'
import { renderApp } from '../../test/render'
import { ScoreDistribution, bucketScores } from './ScoreDistribution'
import { SkillCoverage, coverage } from './SkillCoverage'
import { TopCandidates, topTen } from './TopCandidates'

function scored(score: number, name = 'x', matched: string[] = []): Candidate {
  return {
    resumeId: `${name}-${score}`,
    candidateName: name,
    candidateEmail: null,
    originalFilename: `${name}.pdf`,
    parseStatus: 'PARSED',
    uploadedAt: '2026-08-12T09:31:47Z',
    screening: {
      score,
      semanticScore: 0.5,
      skillScore: 0.5,
      matchedSkills: matched,
      missingSkills: [],
      summaryDegraded: false,
      scoredAt: '2026-08-12T09:35:02Z',
    },
  } as Candidate
}

describe('bucketScores', () => {
  it('puts scores in 10-point buckets', () => {
    expect(bucketScores([scored(0), scored(5), scored(15)])).toEqual([
      2, 1, 0, 0, 0, 0, 0, 0, 0, 0,
    ])
  })

  it('puts 100 in the top bucket rather than an 11th', () => {
    const buckets = bucketScores([scored(100)])
    expect(buckets).toHaveLength(10)
    expect(buckets[9]).toBe(1)
  })

  it('ignores unscreened candidates', () => {
    const unscreened = { ...scored(50), screening: null } as Candidate
    expect(bucketScores([unscreened]).reduce((a, b) => a + b, 0)).toBe(0)
  })
})

describe('topTen', () => {
  it('sorts descending and caps at ten', () => {
    const many = Array.from({ length: 15 }, (_, i) => scored(i * 5, `c${i}`))
    const top = topTen(many)
    expect(top).toHaveLength(10)
    expect(top[0]?.screening?.score).toBe(70)
    expect(top[9]?.screening?.score).toBe(25)
  })

  it('excludes unscreened candidates', () => {
    const unscreened = { ...scored(90), screening: null } as Candidate
    expect(topTen([unscreened, scored(10)])).toHaveLength(1)
  })
})

describe('coverage', () => {
  it('reports the percentage of candidates holding each skill', () => {
    const rows = coverage(
      [scored(80, 'a', ['java']), scored(60, 'b', ['java']), scored(40, 'c', [])],
      ['java'],
    )
    expect(rows).toEqual([{ skill: 'java', percent: 67 }])
  })

  it('caps the axes so labels do not overlap into mush', () => {
    const skills = Array.from({ length: 12 }, (_, i) => `skill${i}`)
    expect(coverage([scored(50, 'a', ['skill0'])], skills).length).toBeLessThanOrEqual(8)
  })

  it('returns nothing when no one has been screened', () => {
    const unscreened = { ...scored(50), screening: null } as Candidate
    expect(coverage([unscreened], ['java'])).toEqual([])
  })
})

describe('chart components', () => {
  it('passes bucket counts to the distribution chart', () => {
    renderApp(<ScoreDistribution candidates={CANDIDATES as Candidate[]} />)
    const el = screen.getByTestId('chart-bar')
    // One scored candidate at 82 -> the 80-89 bucket.
    expect(JSON.parse(el.dataset.values!)[8]).toBe(1)
  })

  it('turns off maintainAspectRatio so the canvas cannot grow unbounded', () => {
    renderApp(<ScoreDistribution candidates={CANDIDATES as Candidate[]} />)
    expect(screen.getByTestId('chart-bar').dataset.maintainAspectRatio).toBe('false')
  })

  it('labels the top-candidates chart with names', () => {
    renderApp(<TopCandidates candidates={CANDIDATES as Candidate[]} />)
    expect(JSON.parse(screen.getByTestId('chart-bar').dataset.labels!)).toEqual(['Omar Khalil'])
  })

  it('offers a text alternative rather than relying on the canvas', () => {
    renderApp(
      <SkillCoverage candidates={CANDIDATES as Candidate[]} requiredSkills={['java', 'docker']} />,
    )
    // The canvas is aria-hidden; the list carries the same numbers.
    expect(screen.getByText(/java: 100%/i)).toBeInTheDocument()
  })

  it('tells the user to screen first when there is nothing to plot', () => {
    renderApp(<SkillCoverage candidates={[]} requiredSkills={['java']} />)
    expect(screen.getByText(/screen the resumes/i)).toBeInTheDocument()
  })
})
