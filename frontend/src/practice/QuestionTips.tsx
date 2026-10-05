import { Link } from 'react-router'
import { type Tip } from '../api/tips'

interface Props {
  tips: Tip[]
}

/** Tips that cite the current question; collapsed so they don't give the answer away up front. */
export function QuestionTips({ tips }: Props) {
  if (tips.length === 0) return null
  return (
    <details className="question-tips">
      <summary>Xem mẹo cho câu này</summary>
      {tips.map((tip) => (
        <div key={tip.id} className="question-tip">
          <p className="question-tip-title">{tip.title}</p>
          <ul>
            {tip.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      ))}
      <Link to="/tips">Xem tất cả mẹo</Link>
    </details>
  )
}
