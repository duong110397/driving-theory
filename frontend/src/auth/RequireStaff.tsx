import { Outlet } from 'react-router'
import { useAuth } from './AuthContext'

/**
 * Route guard for admin pages. Purely cosmetic: the API enforces is_staff on every request,
 * this only avoids showing an empty page to regular users.
 */
export function RequireStaff() {
  const { state } = useAuth()
  if (state.status !== 'authenticated') return null
  if (!state.user.is_staff) {
    return (
      <main className="page narrow">
        <h1>Không có quyền truy cập</h1>
        <p className="muted">Trang này chỉ dành cho quản trị viên.</p>
      </main>
    )
  }
  return <Outlet />
}
