import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { examsApi, type ExamSummary, type Page } from '../api/exams'
import { ExamHistoryList } from '../components/ExamHistoryList'

export function HistoryPage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [loaded, setLoaded] = useState<{ page: number; data?: Page<ExamSummary>; error?: string } | null>(null)

  useEffect(() => {
    let active = true
    examsApi
      .list(page)
      .then((data) => active && setLoaded({ page, data }))
      .catch((err: unknown) => active && setLoaded({ page, error: err instanceof Error ? err.message : String(err) }))
    return () => {
      active = false
    }
  }, [page])

  const current = loaded?.page === page ? loaded : null
  const data = current?.data ?? null
  const error = current?.error ?? null

  return (
    <main className="page narrow">
      <h1>Lịch sử thi</h1>
      {error && (
        <p className="error" role="alert">
          Không tải được lịch sử: {error}
        </p>
      )}
      {!data && !error && <p className="muted">Đang tải…</p>}
      {data && data.count === 0 && (
        <p className="empty">
          Bạn chưa làm bài thi nào. <Link to="/">Chọn hạng và bắt đầu bài thi đầu tiên.</Link>
        </p>
      )}
      {data && data.count > 0 && (
        <>
          <ExamHistoryList exams={data.results} />
          {(data.previous || data.next) && (
            <nav className="pager" aria-label="Phân trang">
              <button
                type="button"
                className="btn btn-quiet"
                disabled={!data.previous}
                onClick={() => setParams({ page: String(page - 1) })}
              >
                Trang trước
              </button>
              <span className="muted">Trang {page}</span>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={!data.next}
                onClick={() => setParams({ page: String(page + 1) })}
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
