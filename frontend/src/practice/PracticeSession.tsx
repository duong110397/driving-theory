import { useCallback, useMemo, useRef } from 'react'
import type { Chapter, Question } from '../api/questions'
import type { Tip } from '../api/tips'
import { QuestionView, type QuestionViewItem } from '../exam/QuestionView'
import { useQuestionHotkeys } from '../exam/useQuestionHotkeys'
import type { ChapterProgress } from './progress'
import { QuestionTips } from './QuestionTips'

interface Props {
  chapter: Chapter
  questions: Question[]
  index: number
  progress: ChapterProgress
  /** Tips keyed by the question numbers they cite. */
  tipsByQuestion: ReadonlyMap<number, Tip[]>
  onIndexChange: (index: number) => void
  onAnswer: (question: number, position: number, correct: boolean) => void
  onReset: () => void
}

function toViewItem(q: Question): QuestionViewItem {
  return {
    number: q.number,
    content: q.content,
    image: q.image,
    image_type: q.image_type,
    options: q.options.map(({ position, text }) => ({ position, text })),
    correct_position: q.options.find((o) => o.is_correct)?.position,
  }
}

export function PracticeSession({
  chapter,
  questions,
  index,
  progress,
  tipsByQuestion,
  onIndexChange,
  onAnswer,
  onReset,
}: Props) {
  const total = questions.length
  const question = questions[index]
  const item = useMemo(() => toViewItem(question), [question])
  const record = progress.answers[question.number]
  const mainRef = useRef<HTMLElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const stats = useMemo(() => {
    let answered = 0
    let correct = 0
    for (const q of questions) {
      const r = progress.answers[q.number]
      if (r) {
        answered++
        if (r.correct) correct++
      }
    }
    return { answered, correct, wrong: answered - correct }
  }, [questions, progress])

  const goTo = useCallback(
    (i: number) => onIndexChange(Math.min(total - 1, Math.max(0, i))),
    [onIndexChange, total],
  )

  const pick = useCallback(
    (position: number) => {
      if (record) return // answered questions stay locked until the topic is reset
      onAnswer(question.number, position, position === item.correct_position)
    },
    [item.correct_position, onAnswer, question.number, record],
  )

  useQuestionHotkeys({
    isBlocked: () => Boolean(dialogRef.current?.open),
    onPrev: () => goTo(index - 1),
    onNext: () => goTo(index + 1),
    onPick: (position) => {
      if (record || !item.options.some((o) => o.position === position)) return false
      pick(position)
      return true
    },
  })

  function jumpFromGrid(i: number) {
    goTo(i)
    // On narrow screens the grid sits below the question; bring the question back into view.
    if (mainRef.current && mainRef.current.getBoundingClientRect().top < 0) {
      mainRef.current.scrollIntoView({ block: 'start' })
    }
  }

  function confirmReset() {
    dialogRef.current?.close()
    onReset()
  }

  return (
    <div className="exam-body">
      <main className="exam-main practice-main" ref={mainRef}>
        <p className="practice-chapter muted">
          Chủ đề {chapter.number}. {chapter.name}
        </p>
        {question.is_critical && <p className="tag-critical">Câu điểm liệt</p>}
        <QuestionView
          key={question.number}
          item={item}
          heading={`Câu ${index + 1}/${total} · số ${question.number} trong bộ 600 câu`}
          selected={record?.position ?? null}
          onSelect={pick}
          review={Boolean(record)}
        />
        <p className="practice-feedback" aria-live="polite">
          {record &&
            (record.correct ? (
              <span className="is-right">Chính xác!</span>
            ) : (
              <span className="is-wrong">Chưa đúng. Đáp án đúng là {item.correct_position}.</span>
            ))}
        </p>
        <QuestionTips key={question.number} tips={tipsByQuestion.get(question.number) ?? []} />
        <div className="exam-nav">
          <button type="button" className="btn btn-quiet" onClick={() => goTo(index - 1)} disabled={index === 0}>
            Câu trước
          </button>
          <button type="button" className="btn btn-primary" onClick={() => goTo(index + 1)} disabled={index === total - 1}>
            Câu tiếp
          </button>
        </div>
        <p className="kbd-hint muted">Mẹo: bấm phím số để chọn đáp án, phím mũi tên để chuyển câu.</p>
      </main>

      <aside className="exam-aside practice-aside" aria-label="Danh sách câu hỏi của chủ đề">
        <p className="practice-stats">
          Đã làm <strong>{stats.answered}</strong>/{total}
          <span className="is-right">{stats.correct} đúng</span>
          <span className="is-wrong">{stats.wrong} sai</span>
        </p>
        <ol className="qgrid">
          {questions.map((q, i) => {
            const r = progress.answers[q.number]
            const status = r ? (r.correct ? 'đúng' : 'sai') : 'chưa làm'
            return (
              <li key={q.number}>
                <button
                  type="button"
                  className={[
                    'qcell',
                    r && (r.correct ? 'is-correct' : 'is-wrong'),
                    i === index && 'is-current',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => jumpFromGrid(i)}
                  aria-current={i === index ? 'step' : undefined}
                  aria-label={`Câu ${i + 1}, ${status}`}
                >
                  {i + 1}
                </button>
              </li>
            )
          })}
        </ol>
        <button
          type="button"
          className="btn btn-quiet btn-block"
          onClick={() => dialogRef.current?.showModal()}
          disabled={stats.answered === 0}
        >
          Làm lại chủ đề này
        </button>
      </aside>

      <dialog ref={dialogRef} className="confirm" aria-labelledby="reset-title">
        <h2 id="reset-title">Làm lại chủ đề?</h2>
        <p>Xoá {stats.answered} câu đã làm trong chủ đề “{chapter.name}” để làm lại từ đầu.</p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-quiet" onClick={() => dialogRef.current?.close()}>
            Huỷ
          </button>
          <button type="button" className="btn btn-primary" onClick={confirmReset}>
            Làm lại
          </button>
        </div>
      </dialog>
    </div>
  )
}
