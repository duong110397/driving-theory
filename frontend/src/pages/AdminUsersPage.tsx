import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { adminApi, type AdminStats, type AdminUser, type UserOrdering, type UserQuery, type UserRole } from '../api/admin'
import type { Page } from '../api/exams'
import { formatDateTime } from '../lib/format'

const SEARCH_DEBOUNCE_MS = 300

const SORTS: { value: string; label: string }[] = [
  { value: '-date_joined', label: 'Mới đăng ký nhất' },
  { value: 'date_joined', label: 'Đăng ký lâu nhất' },
  { value: '-last_login', label: 'Đăng nhập gần đây' },
  { value: '-exam_count', label: 'Thi nhiều nhất' },
  { value: 'username', label: 'Tên đăng nhập A–Z' },
]

const ORDERINGS: ReadonlySet<string> = new Set<UserOrdering>(['date_joined', 'last_login', 'username', 'exam_count'])

/** Reads the list query from the URL, falling back to defaults for anything invalid. */
function readQuery(params: URLSearchParams): UserQuery {
  const sort = params.get('sort') ?? '-date_joined'
  const field = sort.replace(/^-/, '')
  const role = params.get('role')
  return {
    page: Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1),
    search: (params.get('q') ?? '').trim().slice(0, 100),
    ordering: ORDERINGS.has(field) ? (field as UserOrdering) : 'date_joined',
    descending: ORDERINGS.has(field) ? sort.startsWith('-') : true,
    role: role === 'staff' || role === 'user' ? (role as UserRole) : null,
  }
}

function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value.toLocaleString('vi-VN')}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  )
}

function RoleBadge({ user }: { user: AdminUser }) {
  if (user.is_superuser) return <span className="role-badge is-super">Superuser</span>
  if (user.is_staff) return <span className="role-badge is-staff">Quản trị</span>
  return null
}

export function AdminUsersPage() {
  const [params, setParams] = useSearchParams()
  const query = readQuery(params)
  const queryKey = JSON.stringify(query)

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [result, setResult] = useState<{ key: string; data?: Page<AdminUser>; error?: string } | null>(null)
  const [searchInput, setSearchInput] = useState(query.search)

  useEffect(() => {
    const controller = new AbortController()
    adminApi
      .stats(controller.signal)
      .then(setStats)
      .catch(() => setStats(null)) // the user list is the main content; stats are a bonus
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    adminApi
      .users(JSON.parse(queryKey) as UserQuery, controller.signal)
      .then((data) => setResult({ key: queryKey, data }))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ key: queryKey, error: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => controller.abort()
  }, [queryKey])

  function update(changes: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        if (!('page' in changes)) next.delete('page') // any filter change starts from page 1
        return next
      },
      { replace: true },
    )
  }

  // Debounce typing into the URL so every keystroke doesn't hit the API.
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === query.search) return
    const timer = window.setTimeout(() => update({ q: trimmed || null }), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the typed value
  }, [searchInput])

  const current = result?.key === queryKey ? result : null
  const data = current?.data ?? null
  const sortValue = `${query.descending ? '-' : ''}${query.ordering}`

  return (
    <main className="page admin">
      <div className="section-head">
        <h1 className="section-title">Quản trị người dùng</h1>
        <a className="btn btn-quiet" href="/admin/">
          Mở Django admin
        </a>
      </div>

      {stats && (
        <section className="stat-grid" aria-label="Tổng quan">
          <StatTile label="Người dùng" value={stats.users.total} hint={`${stats.users.staff} quản trị viên`} />
          <StatTile label="Đăng ký 7 ngày qua" value={stats.users.new_7d} />
          <StatTile label="Đăng nhập 7 ngày qua" value={stats.users.active_7d} />
          <StatTile
            label="Bài thi"
            value={stats.exams.total}
            hint={`${stats.exams.passed}/${stats.exams.submitted} bài đã nộp đạt`}
          />
        </section>
      )}

      <div className="admin-filters">
        <label className="admin-search">
          <span className="visually-hidden">Tìm theo tên đăng nhập hoặc email</span>
          <input
            type="search"
            placeholder="Tìm theo tên đăng nhập hoặc email…"
            value={searchInput}
            maxLength={100}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
        <label>
          <span className="visually-hidden">Vai trò</span>
          <select value={query.role ?? ''} onChange={(e) => update({ role: e.target.value || null })}>
            <option value="">Tất cả vai trò</option>
            <option value="user">Người dùng</option>
            <option value="staff">Quản trị viên</option>
          </select>
        </label>
        <label>
          <span className="visually-hidden">Sắp xếp</span>
          <select value={sortValue} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {current?.error && (
        <p className="error" role="alert">
          Không tải được danh sách: {current.error}
        </p>
      )}
      {!current && <p className="muted">Đang tải…</p>}
      {data && data.count === 0 && <p className="empty">Không có người dùng nào khớp.</p>}
      {data && data.count > 0 && (
        <>
          <p className="muted admin-count">{data.count.toLocaleString('vi-VN')} người dùng</p>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Tên đăng nhập</th>
                  <th scope="col">Email</th>
                  <th scope="col">Đăng ký</th>
                  <th scope="col">Đăng nhập gần nhất</th>
                  <th scope="col" className="num">
                    Bài thi
                  </th>
                  <th scope="col" className="num">
                    Đạt
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((u) => (
                  <tr key={u.id} className={u.is_active ? undefined : 'is-inactive'}>
                    <td>
                      <Link to={`/quan-tri/users/${u.id}`}>{u.username}</Link> <RoleBadge user={u} />
                      {!u.is_active && <span className="role-badge">Đã khoá</span>}
                    </td>
                    <td className="cell-email">{u.email || <span className="muted">–</span>}</td>
                    <td>{formatDateTime(u.date_joined)}</td>
                    <td>{u.last_login ? formatDateTime(u.last_login) : <span className="muted">Chưa đăng nhập</span>}</td>
                    <td className="num">{u.exam_count}</td>
                    <td className="num">{u.passed_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data.previous || data.next) && (
            <nav className="pager" aria-label="Phân trang">
              <button
                type="button"
                className="btn btn-quiet"
                disabled={!data.previous}
                onClick={() => update({ page: String(query.page - 1) })}
              >
                Trang trước
              </button>
              <span className="muted">Trang {query.page}</span>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={!data.next}
                onClick={() => update({ page: String(query.page + 1) })}
              >
                Trang sau
              </button>
            </nav>
          )}
        </>
      )}
    </main>
  )
}
