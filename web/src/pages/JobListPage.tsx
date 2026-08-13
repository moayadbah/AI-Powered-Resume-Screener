import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useCreateJob, useJobs } from '../api/queries'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'

export function JobListPage() {
  const { data, isPending, isError, error, refetch } = useJobs()
  const createJob = useCreateJob()
  const [showForm, setShowForm] = useState(false)

  return (
    <main className="page">
      <header className="page-head">
        <h1>Jobs</h1>
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'New job'}
        </button>
      </header>

      {showForm && (
        <NewJobForm
          busy={createJob.isPending}
          error={createJob.error}
          onSubmit={(body) =>
            createJob.mutate(body, { onSuccess: () => setShowForm(false) })
          }
        />
      )}

      {isPending && <SkeletonRows />}
      {isError && <ErrorState error={error} onRetry={() => void refetch()} />}

      {data && data.content.length === 0 && (
        <EmptyState
          title="No jobs yet"
          hint="Create one to start screening resumes against it."
        />
      )}

      {data && data.content.length > 0 && (
        <ul className="job-list">
          {data.content.map((job) => (
            <li key={job.id} className="card">
              <Link to={`/jobs/${job.id}`} className="job-title">
                {job.title}
              </Link>
              {job.location && <p className="muted">{job.location}</p>}
              <p className="muted">
                {job.resumeCount} resume{job.resumeCount === 1 ? '' : 's'} ·{' '}
                {job.screenedCount} screened
              </p>
              <ul className="chips">
                {job.requiredSkills.map((s) => (
                  <li key={s} className="chip">
                    {s}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function NewJobForm({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean
  error: unknown
  onSubmit: (body: {
    title: string
    description: string
    requiredSkills: string[]
    location?: string
  }) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [skillDraft, setSkillDraft] = useState('')

  function addSkill() {
    const value = skillDraft.trim().toLowerCase()
    // The server normalises too, but de-duplicating here avoids a confusing
    // response that differs from what was typed.
    if (value && !skills.includes(value)) setSkills([...skills, value])
    setSkillDraft('')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit({
      title,
      description,
      requiredSkills: skills,
      ...(location ? { location } : {}),
    })
  }

  return (
    <form className="card" onSubmit={submit}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
      </label>

      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={50}
          rows={6}
        />
        <span className="hint">{description.length}/50 characters minimum</span>
      </label>

      <label>
        Location (optional)
        <input value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>

      <fieldset>
        <legend>Required skills</legend>
        <div className="chip-input">
          <input
            value={skillDraft}
            onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addSkill()
              }
            }}
            placeholder="e.g. spring boot"
            aria-label="Add a required skill"
          />
          <button type="button" onClick={addSkill}>
            Add
          </button>
        </div>
        <ul className="chips">
          {skills.map((s) => (
            <li key={s} className="chip">
              {s}
              <button
                type="button"
                onClick={() => setSkills(skills.filter((x) => x !== s))}
                aria-label={`Remove ${s}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      {error != null && <ErrorState error={error} />}

      <button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create job'}
      </button>
    </form>
  )
}
