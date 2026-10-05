import type { ExamItem } from '../api/exams'

/** The fields QuestionView needs; exam items and practice questions both provide them. */
export type QuestionViewItem = Pick<ExamItem, 'number' | 'content' | 'image' | 'image_type' | 'options' | 'correct_position'>

interface Props {
  item: QuestionViewItem
  heading: string
  selected: number | null
  onSelect?: (position: number) => void
  /** Review mode: show correct / wrong marks instead of a selectable list. */
  review?: boolean
}

export function QuestionView({ item, heading, selected, onSelect, review = false }: Props) {
  const name = `q-${item.number}`
  return (
    <article className="question">
      <h2 className="question-heading">{heading}</h2>
      <p className="question-text">{item.content}</p>
      {item.image && (
        <figure className={`question-figure is-${item.image_type || 'diagram'}`}>
          <img src={item.image} alt={`Hình minh hoạ cho câu hỏi ${item.number}`} loading="lazy" />
        </figure>
      )}
      <div className="options" role="radiogroup" aria-label="Chọn đáp án">
        {item.options.map((o) => {
          const isSelected = selected === o.position
          const isCorrect = review && o.position === item.correct_position
          const isWrongPick = review && isSelected && !isCorrect
          const cls = ['option', isSelected && 'is-selected', isCorrect && 'is-correct', isWrongPick && 'is-wrong']
            .filter(Boolean)
            .join(' ')
          return (
            <label key={o.position} className={cls}>
              <input
                type="radio"
                name={name}
                value={o.position}
                checked={isSelected}
                disabled={review}
                onChange={() => onSelect?.(o.position)}
              />
              <span className="option-key" aria-hidden="true">
                {o.position}
              </span>
              <span className="option-text">{o.text}</span>
              {isCorrect && <span className="option-mark">Đáp án đúng</span>}
              {isWrongPick && <span className="option-mark">Bạn chọn</span>}
            </label>
          )
        })}
      </div>
    </article>
  )
}
