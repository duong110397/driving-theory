import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { examsApi, type Exam } from '../api/exams'
import { formatDateTime } from '../lib/format'
import { QuestionView } from './QuestionView'

type Filter = 'all' | 'wrong' | 'critical'

export function ExamResult({ exam }: { exam: Exam }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>(exam.passed ? 'all' : 'wrong')
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const wrong = exam.items.filter((i) => !i.is_correct)
  const criticalIndex = exam.items.findIndex((i) => i.is_critical)
  const unanswered = exam.items.filter((i) => i.selected_position == null).length

  const shown = useMemo(
    () =>
      exam.items
        .map((item, i) => ({ item, order: i + 1 }))
        .filter(({ item }) => (filter === 'wrong' ? !item.is_correct : filter === 'critical' ? item.is_critical : true)),
    [exam.items, filter],
  )

  async function retry() {
    setRetrying(true)
    setRetryError(null)
    try {
      const next = await examsApi.create(exam.license_class)
      navigate(`/exams/${next.id}`)
    } catch {
      setRetryError('Không tạo được đề mới. Thử lại sau ít phút.')
      setRetrying(false)
    }
  }

  let reason: string
  if (exam.failed_critical) {
    reason = `Bạn trả lời sai câu điểm liệt (câu ${criticalIndex + 1}). Sai câu này là không đạt, bất kể số câu đúng.`
  } else if (exam.passed) {
    reason = `Bạn trả lời đúng ${exam.score} câu, yêu cầu tối thiểu ${exam.pass_score} câu.`
  } else {
    reason = `Bạn trả lời đúng ${exam.score} câu, cần ít nhất ${exam.pass_score} câu để đạt.`
  }

  return (
    <main className="page result">
      <section className={`verdict ${exam.passed ? 'is-pass' : 'is-fail'}`} aria-labelledby="verdict-title">
        <div className="verdict-sign" aria-hidden="true">
          {exam.passed ? '✓' : '✕'}
        </div>
        <div className="verdict-body">
          <h1 id="verdict-title">{exam.passed ? 'Đạt' : 'Không đạt'}</h1>
          <p className="verdict-score">
            <strong>{exam.score}</strong>/{exam.total_questions}
            <span className="muted"> câu đúng</span>
          </p>
          <p>{reason}</p>
          <p className="muted">
            Hạng {exam.license_class}, thi lúc {formatDateTime(exam.started_at)}
            {unanswered > 0 && `, bỏ trống ${unanswered} câu`}
          </p>
        </div>
        <div className="verdict-actions">
          <button type="button" className="btn btn-primary" onClick={retry} disabled={retrying}>
            {retrying ? 'Đang tạo đề…' : `Thi lại hạng ${exam.license_class}`}
          </button>
          <Link to="/" className="btn btn-quiet">
            Chọn hạng khác
          </Link>
          {retryError && (
            <p className="error" role="alert">
              {retryError}
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="review-title">
        <div className="section-head">
          <h2 id="review-title" className="section-title">
            Xem lại bài làm
          </h2>
          <div className="filters" role="group" aria-label="Lọc câu hỏi">
            {(
              [
                ['wrong', `Câu sai (${wrong.length})`],
                ['critical', 'Câu điểm liệt'],
                ['all', `Tất cả (${exam.items.length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter ${filter === value ? 'is-active' : ''}`}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="empty">Không có câu sai nào. Bạn có thể xem tất cả các câu để ôn lại.</p>
        ) : (
          <ol className="review-list">
            {shown.map(({ item, order }) => (
              <li key={item.number} className={`review-item ${item.is_correct ? 'is-correct' : 'is-wrong'}`}>
                <div className="review-tags">
                  <span className={`verdict-chip ${item.is_correct ? 'is-pass' : 'is-fail'}`}>
                    {item.is_correct ? 'Đúng' : item.selected_position == null ? 'Bỏ trống' : 'Sai'}
                  </span>
                  {item.is_critical && <span className="verdict-chip is-critical">Câu điểm liệt</span>}
                  <span className="muted">Câu số {item.number} trong bộ 600 câu</span>
                </div>
                <QuestionView item={item} heading={`Câu ${order}`} selected={item.selected_position} review />
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  )
}
