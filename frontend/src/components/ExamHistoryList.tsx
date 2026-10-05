import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { ExamSummary } from '../api/exams'
import { formatDateTime } from '../lib/format'

interface Props {
  exams: ExamSummary[]
  /** Rows link to the exam page only for its owner; admins viewing someone else's history get plain rows. */
  linkToExam?: boolean
}

export function ExamHistoryList({ exams, linkToExam = true }: Props) {
  return (
    <ul className="history-list">
      {exams.map((e) => (
        <li key={e.id}>
          <Row to={linkToExam ? `/exams/${e.id}` : null}>
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
          </Row>
        </li>
      ))}
    </ul>
  )
}

function Row({ to, children }: { to: string | null; children: ReactNode }) {
  return to ? (
    <Link to={to} className="history-row">
      {children}
    </Link>
  ) : (
    <div className="history-row">{children}</div>
  )
}
