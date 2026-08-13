/**
 * Drag-and-drop plus a real file input.
 *
 * Drag-only would exclude keyboard users, so the <input> is the primary control
 * and the drop target is an enhancement.
 */

import { useRef, useState, type DragEvent } from 'react'

const MAX_FILES = 10
const MAX_BYTES = 5 * 1024 * 1024

interface Props {
  busy: boolean
  onUpload: (files: File[]) => void
}

export function UploadDropzone({ busy, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [problems, setProblems] = useState<string[]>([])

  /**
   * Courtesy validation only - the server checks magic bytes and is the real
   * gate. This just saves an obviously-doomed round trip.
   */
  function accept(fileList: FileList | null) {
    if (!fileList) return
    const files = Array.from(fileList)
    const rejected: string[] = []
    const ok: File[] = []

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        rejected.push(`${file.name}: not a PDF`)
      } else if (file.size > MAX_BYTES) {
        rejected.push(`${file.name}: over 5 MB`)
      } else {
        ok.push(file)
      }
    }

    if (ok.length > MAX_FILES) {
      rejected.push(`Only ${MAX_FILES} files per upload; the rest were skipped.`)
    }

    setProblems(rejected)
    if (ok.length > 0) onUpload(ok.slice(0, MAX_FILES))
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    accept(event.dataTransfer.files)
  }

  return (
    <div className="card">
      <div
        className={`dropzone${dragging ? ' dropzone-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>Drop PDF resumes here</p>
        <p className="muted">up to {MAX_FILES} files, 5 MB each</p>

        <label className="file-label">
          <span className="button-like">{busy ? 'Uploading…' : 'Choose files'}</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            disabled={busy}
            onChange={(e) => {
              accept(e.target.files)
              // Allow re-selecting the same file after a failure.
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {problems.length > 0 && (
        <ul className="form-error" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
