import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'

export function AppLayout() {
  const { state, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (state.status !== 'authenticated') return null
  const { user } = state
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username

  async function handleLogout() {
    setLoggingOut(true)
    setError(null)
    try {
      await logout()
    } catch {
      setError('Đăng xuất thất bại. Kiểm tra kết nối rồi thử lại.')
      setLoggingOut(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Lý thuyết lái xe
        </NavLink>
        <nav className="topnav" aria-label="Điều hướng chính">
          <NavLink to="/" end>
            Thi thử
          </NavLink>
          <NavLink to="/history">Lịch sử</NavLink>
        </nav>
        <div className="topbar-user">
          <span className="topbar-name">{displayName}</span>
          <button type="button" className="btn btn-quiet" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        </div>
      </header>
      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}
      <Outlet />
    </>
  )
}
