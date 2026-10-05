import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthContext'

export interface LoginLocationState {
  from?: string
}

/** Route guard: renders child routes only for an authenticated user. */
export function RequireAuth() {
  const { state, reload } = useAuth()
  const location = useLocation()

  switch (state.status) {
    case 'loading':
      return <p className="center muted">Đang tải…</p>
    case 'error':
      return (
        <div className="center">
          <p className="error">Không kết nối được máy chủ: {state.message}</p>
          <button type="button" onClick={reload}>
            Thử lại
          </button>
        </div>
      )
    case 'anonymous': {
      const from = `${location.pathname}${location.search}${location.hash}`
      return <Navigate to="/login" replace state={{ from } satisfies LoginLocationState} />
    }
    case 'authenticated':
      return <Outlet />
  }
}
