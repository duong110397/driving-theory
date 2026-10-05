import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { examsApi, type Answers, type Exam } from '../api/exams'
import { Countdown } from './Countdown'
import { QuestionView } from './QuestionView'
import { useQuestionHotkeys } from './useQuestionHotkeys'
import { useCountdown } from './useCountdown'

type SaveState = 'saving' | 'saved' | 'error'

interface Props {
  exam: Exam
  /** Called with the graded exam once it is submitted (by the user or when time runs out). */
  onFinished: (exam: Exam) => void
}

export function ExamRunner({ exam, onFinished }: Props) {
  const total = exam.items.length
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>(() =>
    Object.fromEntries(exam.items.map((i) => [i.number, i.selected_position])),
  )
  const [saveState, setSaveState] = useState<Record<number, SaveState>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const submittedRef = useRef(false)
  const answersRef = useRef(answers)
  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  const item = exam.items[index]
  const answeredCount = useMemo(() => Object.values(answers).filter((v) => v != null).length, [answers])
  const unanswered = total - answeredCount

  const submit = useCallback(async () => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    dialogRef.current?.close()
    try {
      // Send every answer again: covers any autosave that failed along the way.
      onFinished(await examsApi.submit(exam.id, answersRef.current))
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already graded (e.g. submitted from another tab): show the stored result.
        onFinished(await examsApi.get(exam.id))
        return
      }
      submittedRef.current = false
      setSubmitting(false)
      setSubmitError('Chưa nộp được bài. Đáp án vẫn được giữ, kiểm tra kết nối rồi bấm Nộp bài lần nữa.')
    }
  }, [exam.id, onFinished])

  // Time is up: submit automatically, like the exam software does.
  const secondsLeft = useCountdown(exam.remaining_seconds, () => void submit())

  const select = useCallback(
    (number: number, position: number) => {
      setAnswers((prev) => ({ ...prev, [number]: position }))
      setSaveState((prev) => ({ ...prev, [number]: 'saving' }))
      examsApi
        .saveAnswer(exam.id, number, position)
        .then(() => setSaveState((prev) => ({ ...prev, [number]: 'saved' })))
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 409) {
            void submit() // the server has closed the exam
            return
          }
          setSaveState((prev) => ({ ...prev, [number]: 'error' }))
        })
    },
    [exam.id, submit],
  )

  const goTo = useCallback((i: number) => setIndex(Math.min(total - 1, Math.max(0, i))), [total])

  useQuestionHotkeys({
    isBlocked: () => submitting || Boolean(dialogRef.current?.open),
    onPrev: () => goTo(index - 1),
    onNext: () => goTo(index + 1),
    onPick: (position) => {
      if (!item.options.some((o) => o.position === position)) return false
      select(item.number, position)
      return true
    },
  })

  const failedSaves = Object.values(saveState).filter((s) => s === 'error').length
  const currentSave = saveState[item.number]

  return (
    <div className="exam">
      <div className="exam-bar">
        <div className="exam-bar-info">
          <span className="class-code">{exam.license_class}</span>
          <span>
            Đã làm <strong>{answeredCount}</strong>/{total}
          </span>
        </div>
        <Countdown secondsLeft={secondsLeft} />
      </div>

      <div className="exam-body">
        <main className="exam-main">
          <QuestionView
            item={item}
            heading={`Câu ${index + 1}/${total}`}
            selected={answers[item.number] ?? null}
            onSelect={(position) => select(item.number, position)}
          />
          <p className="save-status" aria-live="polite">
            {currentSave === 'saving' && 'Đang lưu…'}
            {currentSave === 'saved' && 'Đã lưu đáp án'}
            {currentSave === 'error' && <span className="error">Chưa lưu được. Đáp án sẽ được gửi lại khi nộp bài.</span>}
          </p>
          <div className="exam-nav">
            <button type="button" className="btn btn-quiet" onClick={() => goTo(index - 1)} disabled={index === 0}>
              Câu trước
            </button>
            {index < total - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => goTo(index + 1)}>
                Câu tiếp
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => dialogRef.current?.showModal()}>
                Nộp bài
              </button>
            )}
          </div>
          <p className="kbd-hint muted">Mẹo: bấm phím số để chọn đáp án, phím mũi tên để chuyển câu.</p>
        </main>

        <aside className="exam-aside" aria-label="Danh sách câu hỏi">
          <ol className="qgrid">
            {exam.items.map((it, i) => {
              const done = answers[it.number] != null
              return (
                <li key={it.number}>
                  <button
                    type="button"
                    className={['qcell', done && 'is-done', i === index && 'is-current'].filter(Boolean).join(' ')}
                    onClick={() => goTo(i)}
                    aria-current={i === index ? 'step' : undefined}
                    aria-label={`Câu ${i + 1}${done ? ', đã trả lời' : ', chưa trả lời'}`}
                  >
                    {i + 1}
                  </button>
                </li>
              )
            })}
          </ol>
          {submitError && (
            <p className="error" role="alert">
              {submitError}
            </p>
          )}
          {failedSaves > 0 && !submitError && (
            <p className="error">{failedSaves} đáp án chưa lưu được, sẽ được gửi khi nộp bài.</p>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => dialogRef.current?.showModal()}
            disabled={submitting}
          >
            {submitting ? 'Đang nộp bài…' : 'Nộp bài'}
          </button>
        </aside>
      </div>

      <dialog ref={dialogRef} className="confirm" aria-labelledby="confirm-title">
        <h2 id="confirm-title">Nộp bài?</h2>
        <p>
          {unanswered > 0
            ? `Bạn còn ${unanswered} câu chưa trả lời. Câu chưa trả lời được tính là sai.`
            : 'Bạn đã trả lời tất cả các câu. Sau khi nộp sẽ không sửa được nữa.'}
        </p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-quiet" onClick={() => dialogRef.current?.close()}>
            Làm tiếp
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()}>
            Nộp bài
          </button>
        </div>
      </dialog>
    </div>
  )
}
