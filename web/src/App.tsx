import { Link, Navigate, Route, Routes } from 'react-router-dom'

import { useAuth } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { CandidateDetailPage } from './pages/CandidateDetailPage'
import { JobDetailPage } from './pages/JobDetailPage'
import { JobListPage } from './pages/JobListPage'
import { LoginPage } from './pages/LoginPage'

export function App() {
  const { isAuthenticated, signOut } = useAuth()

  return (
    <>
      {isAuthenticated && (
        <nav className="topbar">
          <Link to="/jobs" className="brand">
            Resume Screener
          </Link>
          <button type="button" className="linkish" onClick={signOut}>
            Sign out
          </button>
        </nav>
      )}

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/jobs"
          element={
            <RequireAuth>
              <JobListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/jobs/:jobId"
          element={
            <RequireAuth>
              <JobDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/candidates/:resumeId"
          element={
            <RequireAuth>
              <CandidateDetailPage />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/jobs" replace />} />
        <Route path="*" element={<Navigate to="/jobs" replace />} />
      </Routes>
    </>
  )
}
