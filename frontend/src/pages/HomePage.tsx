import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { examsApi, LICENSE_DESCRIPTIONS, LICENSE_GROUPS, type ExamRule, type ExamSummary } from '../api/exams'
import { ExamHistoryList } from '../components/ExamHistoryList'

type Load<T> = { kind: 'loading' } | { kind: 'ok'; data: T } | { kind: 'error'; message: string }

export function HomePage() {
  const navigate = useNavigate()
  const [rules, setRules] = useState<Load<Record<string, ExamRule>>>({ kind: 'loading' })
  const [recent, setRecent] = useState<ExamSummary[]>([])
  const [inProgress, setInProgress] = useState<ExamSummary | null>(null)
  const [selected, setSelected] = useState<string>('B')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  useEffect(() => {
    examsApi
      .rules()
      .then((list) => setRules({ kind: 'ok', data: Object.fromEntries(list.map((r) => [r.license_class, r])) }))
      .catch((err: unknown) =>
        setRules({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      )
    examsApi
      .list()
      .then((page) => {
        setRecent(page.results.slice(0, 3))
        const now = Date.now()
        setInProgress(page.results.find((e) => e.status === 'in_progress' && Date.parse(e.expires_at) > now) ?? null)
      })
      .catch(() => setRecent([])) // history is secondary; the page still works without it
  }, [])

  async function start() {
    setStarting(true)
    setStartError(null)
    try {
      const exam = await examsApi.create(selected)
      navigate(`/exams/${exam.id}`)
    } catch (err) {
      setStartError(
        err instanceof ApiError && err.status === 429
          ? 'Bạn đã tạo quá nhiều đề trong một giờ. Hãy thử lại sau.'
          : 'Không tạo được đề thi. Kiểm tra kết nối rồi thử lại.',
      )
      setStarting(false)
    }
  }

  if (rules.kind === 'loading') return <p className="page center muted">Đang tải…</p>
  if (rules.kind === 'error') {
    return (
      <p className="page center error" role="alert">
        Không tải được danh sách hạng thi: {rules.message}
      </p>
    )
  }
  const rule = rules.data[selected]

  return (
    <main className="page home">
      <div className="home-intro">
        <h1>Thi thử lý thuyết</h1>
        <p className="lede">
          Đề được bốc ngẫu nhiên từ bộ 600 câu hỏi theo đúng cấu trúc của Cục Cảnh sát giao thông, chấm điểm như ở
          phòng thi.
        </p>
      </div>

      {inProgress && (
        <Link to={`/exams/${inProgress.id}`} className="resume">
          <span>
            Bạn đang làm dở bài thi hạng <strong>{inProgress.license_class}</strong>
          </span>
          <span className="resume-action">Làm tiếp</span>
        </Link>
      )}

      <div className="home-grid">
        <section aria-labelledby="pick-class">
          <h2 id="pick-class" className="section-title">
            Chọn hạng giấy phép
          </h2>
          {LICENSE_GROUPS.map((group) => (
            <fieldset key={group.title} className="class-group">
              <legend>
                {group.title}
                <span className="muted">{group.description}</span>
              </legend>
              <div className="class-list">
                {group.classes.map((cls) => (
                  <label key={cls} className="class-tile">
                    <input
                      type="radio"
                      name="license_class"
                      value={cls}
                      checked={selected === cls}
                      onChange={() => setSelected(cls)}
                    />
                    <span className="class-code">{cls}</span>
                    <span className="class-desc">{LICENSE_DESCRIPTIONS[cls]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {/* Small screens: the start panel sits below all classes, so keep a start bar in reach */}
          <div className="mobile-start">
            <button type="button" className="btn btn-primary btn-block" onClick={start} disabled={starting}>
              {starting
                ? 'Đang tạo đề…'
                : `Bắt đầu thi hạng ${selected} (${rule.total_questions} câu, ${rule.duration_minutes} phút)`}
            </button>
          </div>
        </section>

        <aside className="start-panel" aria-labelledby="start-title">
          <h2 id="start-title">
            Hạng <span className="class-code">{selected}</span>
          </h2>
          <dl className="facts">
            <div>
              <dt>Số câu</dt>
              <dd>{rule.total_questions}</dd>
            </div>
            <div>
              <dt>Thời gian</dt>
              <dd>{rule.duration_minutes} phút</dd>
            </div>
            <div>
              <dt>Cần đúng</dt>
              <dd>
                {rule.pass_score}/{rule.total_questions}
              </dd>
            </div>
          </dl>
          <ul className="structure">
            {rule.sections.map((s) => (
              <li key={s.label}>
                <span>{s.label}</span>
                <span className="structure-count">{s.count}</span>
              </li>
            ))}
          </ul>
          <p className="note">
            Đề có 1 câu điểm liệt. Trả lời sai câu này là không đạt, dù đủ số câu đúng. Hết giờ, bài được tự động nộp.
          </p>
          {startError && (
            <p className="error" role="alert">
              {startError}
            </p>
          )}
          <button type="button" className="btn btn-primary btn-block" onClick={start} disabled={starting}>
            {starting ? 'Đang tạo đề…' : `Bắt đầu thi hạng ${selected}`}
          </button>
        </aside>
      </div>

      {recent.length > 0 && (
        <section className="recent" aria-labelledby="recent-title">
          <div className="section-head">
            <h2 id="recent-title" className="section-title">
              Bài thi gần đây
            </h2>
            <Link to="/history">Xem tất cả</Link>
          </div>
          <ExamHistoryList exams={recent} />
        </section>
      )}
    </main>
  )
}
