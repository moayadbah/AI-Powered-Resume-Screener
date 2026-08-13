/**
 * Score with a band label.
 *
 * Deliberately not red/green pass-fail: the score is one advisory signal, and
 * nothing is auto-rejected (docs/00-PROJECT-BRIEF.md). The text label also means
 * the band is never carried by colour alone.
 */

export type Band = 'strong' | 'good' | 'partial' | 'weak'

export function bandFor(score: number): Band {
  if (score >= 80) return 'strong'
  if (score >= 60) return 'good'
  if (score >= 40) return 'partial'
  return 'weak'
}

const LABEL: Record<Band, string> = {
  strong: 'Strong match',
  good: 'Good match',
  partial: 'Partial match',
  weak: 'Weak match',
}

export function ScoreBadge({ score }: { score: number }) {
  const band = bandFor(score)
  return (
    <span className={`badge badge-${band}`}>
      <strong className="badge-score">{score}</strong>
      <span className="badge-label">{LABEL[band]}</span>
    </span>
  )
}
