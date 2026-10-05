import { Link } from 'react-router'
import type { ExamSummary } from '../api/exams'
import { formatDateTime } from '../lib/format'

export function ExamHistoryList({ exams }: { exams: ExamSummary[] }) {
  return (
    <ul className="history-list">
      {exams.map((e) => (
        <li key={e.id}>
          <Link to={`/exams/${e.id}`} className="history-row">
            <span className="class-code">{e.license_class}</span>
            <span className="history-date">{formatDateTime(e.started_at)}</span>
            {e.status === 'submitted' ? (
              <>
                <span className="history-score">
                  {e.score}/{e.total_questions}
                </span>
                <span className={`verdict-chip ${e.passed ? 'is-pass' : 'is-fail'}`}>
                  {e.passed ? 'Đạt' : e.failed_critical ? 'Sai điểm liệt' : 'Không đạt'}
                </span>
              </>
            ) : (
              <>
                <span className="history-score muted">–</span>
                <span className="verdict-chip">Đang làm</span>
              </>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
