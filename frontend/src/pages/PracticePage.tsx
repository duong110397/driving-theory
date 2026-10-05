import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router'
import { questionsApi, type Chapter, type Question } from '../api/questions'
import { tipsApi, type Tip } from '../api/tips'
import { useAuth } from '../auth/AuthContext'
import { ChapterTabs } from '../practice/ChapterTabs'
import { PracticeSession } from '../practice/PracticeSession'
import { usePracticeProgress } from '../practice/usePracticeProgress'

type Load<T> = { kind: 'loading' } | { kind: 'ok'; data: T } | { kind: 'error'; message: string }

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** `/practice/:chapter?cau=N`: every question of the bank, grouped by topic, with instant feedback. */
export function PracticePage() {
  const { state } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : 0
  const { progress, chapterProgress, answer, visit, resetChapter } = usePracticeProgress(userId)

  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const chapterNumber = Number(params.chapter)

  const [chapters, setChapters] = useState<Load<Chapter[]>>({ kind: 'loading' })
  // Loaded chapters stay cached so switching back and forth between topics is instant.
  const [questionsByChapter, setQuestionsByChapter] = useState<Record<number, Question[]>>({})
  const [questionsError, setQuestionsError] = useState<{ chapter: number; message: string } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [tips, setTips] = useState<Tip[]>([])

  useEffect(() => {
    const controller = new AbortController()
    questionsApi
      .chapters(controller.signal)
      .then((data) => setChapters({ kind: 'ok', data }))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setChapters({ kind: 'error', message: errorMessage(err) })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    tipsApi
      .get(controller.signal)
      .then((book) => setTips(book.tips))
      .catch(() => setTips([])) // tips are optional; practice works without them
    return () => controller.abort()
  }, [])

  const tipsByQuestion = useMemo(() => {
    const map = new Map<number, Tip[]>()
    for (const tip of tips) {
      for (const q of tip.questions) map.set(q.number, [...(map.get(q.number) ?? []), tip])
    }
    return map
  }, [tips])

  const chapter = chapters.kind === 'ok' ? chapters.data.find((c) => c.number === chapterNumber) : undefined
  const questions = chapter ? questionsByChapter[chapter.number] : undefined

  useEffect(() => {
    if (!chapter || questions) return
    const controller = new AbortController()
    questionsApi
      .listByChapter(chapter.number, controller.signal)
      .then((list) => setQuestionsByChapter((prev) => ({ ...prev, [chapter.number]: list })))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setQuestionsError({ chapter: chapter.number, message: errorMessage(err) })
      })
    return () => controller.abort()
  }, [chapter, questions, reloadKey])

  // `so` = question number in the 600 bank (links from tips); `cau` = 1-based position in the topic.
  // Moving between questions rewrites the URL to `cau`, so `so` only applies on arrival.
  const index = useMemo(() => {
    if (!questions) return 0
    const byNumber = Number.parseInt(searchParams.get('so') ?? '', 10)
    const found = questions.findIndex((q) => q.number === byNumber)
    if (found >= 0) return found
    const requested = Number.parseInt(searchParams.get('cau') ?? '1', 10)
    return Math.min(Math.max(Number.isNaN(requested) ? 0 : requested - 1, 0), questions.length - 1)
  }, [questions, searchParams])

  useEffect(() => {
    if (chapter && questions) visit(chapter.number, index)
  }, [chapter, questions, index, visit])

  const setIndex = useCallback(
    (i: number) => setSearchParams({ cau: String(i + 1) }, { replace: true }),
    [setSearchParams],
  )

  if (chapters.kind === 'loading') return <p className="page center muted">Đang tải…</p>
  if (chapters.kind === 'error') {
    return (
      <p className="page center error" role="alert">
        Không tải được danh sách chủ đề: {chapters.message}
      </p>
    )
  }
  if (chapters.data.length === 0) return <p className="page center empty">Chưa có câu hỏi nào.</p>

  if (!chapter) {
    // No (or unknown) topic in the URL: resume the last one, else start with the first.
    const target = chapters.data.find((c) => c.number === progress.lastChapter) ?? chapters.data[0]
    const resumeAt = chapterProgress(target.number).lastIndex + 1
    return <Navigate to={`/practice/${target.number}?cau=${resumeAt}`} replace />
  }

  const loadError = questionsError?.chapter === chapter.number ? questionsError.message : null

  return (
    <div className="practice">
      <div className="practice-head">
        <h1 className="visually-hidden">Ôn tập theo chủ đề</h1>
        <ChapterTabs chapters={chapters.data} progress={progress} />
      </div>
      {questions ? (
        questions.length > 0 ? (
          <PracticeSession
            chapter={chapter}
            questions={questions}
            index={index}
            progress={chapterProgress(chapter.number)}
            tipsByQuestion={tipsByQuestion}
            onIndexChange={setIndex}
            onAnswer={(question, position, correct) => answer(chapter.number, question, position, correct)}
            onReset={() => {
              resetChapter(chapter.number)
              setIndex(0)
            }}
          />
        ) : (
          <p className="page center empty">Chủ đề này chưa có câu hỏi.</p>
        )
      ) : loadError ? (
        <div className="page center">
          <p className="error" role="alert">
            Không tải được câu hỏi: {loadError}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setQuestionsError(null)
              setReloadKey((k) => k + 1)
            }}
          >
            Thử lại
          </button>
        </div>
      ) : (
        <p className="page center muted">Đang tải câu hỏi…</p>
      )}
    </div>
  )
}
