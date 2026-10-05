import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { adminApi, type AdminUserDetail } from '../api/admin'
import { ApiError } from '../api/client'
import { ExamHistoryList } from '../components/ExamHistoryList'
import { formatDateTime } from '../lib/format'

export function AdminUserDetailPage() {
  const { id } = useParams()
  const userId = Number(id)
  const [result, setResult] = useState<{ id: number; user?: AdminUserDetail; error?: string } | null>(null)

  useEffect(() => {
    if (!Number.isInteger(userId) || userId <= 0) return
    const controller = new AbortController()
    adminApi
      .user(userId, controller.signal)
      .then((user) => setResult({ id: userId, user }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const message =
          err instanceof ApiError && err.status === 404
            ? 'Không tìm thấy người dùng này.'
            : err instanceof Error
              ? err.message
              : String(err)
        setResult({ id: userId, error: message })
      })
    return () => controller.abort()
  }, [userId])

  const current = result?.id === userId ? result : null
  const invalidId = !Number.isInteger(userId) || userId <= 0
  const user = current?.user

  return (
    <main className="page narrow admin">
      <p>
        <Link to="/quan-tri">← Danh sách người dùng</Link>
      </p>
      {(invalidId || current?.error) && (
        <p className="error" role="alert">
          {invalidId ? 'Đường dẫn không hợp lệ.' : current?.error}
        </p>
      )}
      {!invalidId && !current && <p className="muted">Đang tải…</p>}
      {user && (
        <>
          <h1>{user.username}</h1>
          <dl className="facts admin-facts">
            <div>
              <dt>Email</dt>
              <dd>{user.email || '–'}</dd>
            </div>
            <div>
              <dt>Vai trò</dt>
              <dd>{user.is_superuser ? 'Superuser' : user.is_staff ? 'Quản trị viên' : 'Người dùng'}</dd>
            </div>
            <div>
              <dt>Trạng thái</dt>
              <dd>{user.is_active ? 'Đang hoạt động' : 'Đã khoá'}</dd>
            </div>
            <div>
              <dt>Đăng ký</dt>
              <dd>{formatDateTime(user.date_joined)}</dd>
            </div>
            <div>
              <dt>Đăng nhập gần nhất</dt>
              <dd>{user.last_login ? formatDateTime(user.last_login) : 'Chưa đăng nhập'}</dd>
            </div>
            <div>
              <dt>Bài thi</dt>
              <dd>
                {user.exam_count} bài, {user.passed_count} đạt
              </dd>
            </div>
          </dl>

          <h2 className="section-title">Bài thi gần đây</h2>
          {user.recent_exams.length === 0 ? (
            <p className="empty">Người dùng này chưa làm bài thi nào.</p>
          ) : (
            <ExamHistoryList exams={user.recent_exams} linkToExam={false} />
          )}
        </>
      )}
    </main>
  )
}
