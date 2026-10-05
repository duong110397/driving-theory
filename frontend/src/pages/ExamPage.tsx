import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { examsApi, type Exam } from '../api/exams'
import { ExamResult } from '../exam/ExamResult'
import { ExamRunner } from '../exam/ExamRunner'

type Loaded = { kind: 'ok'; exam: Exam } | { kind: 'not-found' } | { kind: 'error'; message: string }

export function ExamPage() {
  const { id = '' } = useParams()
  // Tagged with the id it belongs to, so navigating to another exam shows "loading" without a reset effect.
  const [loaded, setLoaded] = useState<{ id: string; value: Loaded } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    examsApi
      .get(id, controller.signal)
      .then((exam) => setLoaded({ id, value: { kind: 'ok', exam } }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const value: Loaded =
          err instanceof ApiError && err.status === 404
            ? { kind: 'not-found' }
            : { kind: 'error', message: err instanceof Error ? err.message : String(err) }
        setLoaded({ id, value })
      })
    return () => controller.abort()
  }, [id])

  const onFinished = useCallback(
    (exam: Exam) => {
      window.scrollTo({ top: 0 })
      setLoaded({ id, value: { kind: 'ok', exam } })
    },
    [id],
  )

  const state: Loaded | { kind: 'loading' } = loaded?.id === id ? loaded.value : { kind: 'loading' }
  switch (state.kind) {
    case 'loading':
      return <p className="page center muted">Đang tải bài thi…</p>
    case 'not-found':
      return (
        <p className="page center">
          Không tìm thấy bài thi này. <Link to="/">Về trang chọn hạng thi</Link>
        </p>
      )
    case 'error':
      return (
        <p className="page center error" role="alert">
          Không tải được bài thi: {state.message}
        </p>
      )
    case 'ok':
      // key: remount the runner for a different attempt so its timer and answers reset
      return state.exam.status === 'in_progress' ? (
        <ExamRunner key={state.exam.id} exam={state.exam} onFinished={onFinished} />
      ) : (
        <ExamResult exam={state.exam} />
      )
  }
}
