import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { questionsApi, type Chapter } from '../api/questions'
import { practiceLink, tipsApi, type Myth, type TipBook, type TipQuestionRef } from '../api/tips'

type Load<T> = { kind: 'loading' } | { kind: 'ok'; data: T } | { kind: 'error'; message: string }

function QuestionLinks({ questions }: { questions: TipQuestionRef[] }) {
  if (questions.length === 0) return null
  return (
    <p className="tip-questions">
      <span className="muted">Áp dụng cho câu:</span>
      {questions.map((q) => (
        <Link key={q.number} to={practiceLink(q)} className="tip-qlink" aria-label={`Làm câu số ${q.number}`}>
          {q.number}
        </Link>
      ))}
    </p>
  )
}

function MythCard({ myth }: { myth: Myth }) {
  const percent = myth.stats && myth.stats.applicable > 0 ? Math.round((myth.stats.correct / myth.stats.applicable) * 100) : null
  return (
    <li className="myth">
      <p className="myth-claim">
        <span className="myth-label">Mẹo trên mạng</span>“{myth.claim}”
      </p>
      <p className="myth-truth">{myth.truth}</p>
      {myth.stats && percent !== null && (
        <p className="myth-stats">
          Kiểm tra trên bộ 600 câu: đúng <strong>{myth.stats.correct}</strong>/{myth.stats.applicable} câu áp dụng được (
          {percent}%), sai <strong>{myth.stats.applicable - myth.stats.correct}</strong> câu.
        </p>
      )}
      <QuestionLinks questions={myth.questions} />
    </li>
  )
}

export function TipsPage() {
  const [state, setState] = useState<Load<{ book: TipBook; chapters: Chapter[] }>>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([tipsApi.get(controller.signal), questionsApi.chapters(controller.signal)])
      .then(([book, chapters]) => setState({ kind: 'ok', data: { book, chapters } }))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => controller.abort()
  }, [])

  if (state.kind === 'loading') return <p className="page center muted">Đang tải…</p>
  if (state.kind === 'error') {
    return (
      <p className="page center error" role="alert">
        Không tải được mẹo: {state.message}
      </p>
    )
  }

  const { book, chapters } = state.data
  const sections = chapters
    .map((chapter) => ({ chapter, tips: book.tips.filter((t) => t.chapter === chapter.number) }))
    .filter((s) => s.tips.length > 0)

  return (
    <main className="page narrow tips">
      <h1>Mẹo học lý thuyết</h1>
      <p className="lede">
        Mẹo ghi nhớ cho bộ 600 câu năm 2025. Mỗi mẹo đã được đối chiếu với đáp án chính thức của các câu ghi bên dưới;
        bấm vào số câu để làm thử ngay.
      </p>

      <nav className="tips-toc" aria-label="Mục lục">
        <a href="#meo-sai">Mẹo sai cần tránh</a>
        {sections.map(({ chapter }) => (
          <a key={chapter.number} href={`#chuong-${chapter.number}`}>
            {chapter.number}. {chapter.name}
          </a>
        ))}
      </nav>

      <section id="meo-sai" className="myths" aria-labelledby="myths-title">
        <h2 id="myths-title" className="section-title">
          Mẹo phổ biến trên mạng nhưng không còn đúng
        </h2>
        <p className="muted">
          Nhiều mẹo được viết cho bộ đề cũ hoặc chỉ là đoán mò. Với câu điểm liệt, một lần đoán sai là trượt.
        </p>
        <ul className="myth-list">
          {book.myths.map((m) => (
            <MythCard key={m.id} myth={m} />
          ))}
        </ul>
      </section>

      {sections.map(({ chapter, tips }) => (
        <section key={chapter.number} id={`chuong-${chapter.number}`} aria-labelledby={`chuong-${chapter.number}-title`}>
          <h2 id={`chuong-${chapter.number}-title`} className="section-title">
            Chủ đề {chapter.number}. {chapter.name}
          </h2>
          <ul className="tip-list">
            {tips.map((tip) => (
              <li key={tip.id} className="tip">
                <h3>{tip.title}</h3>
                <ul>
                  {tip.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <QuestionLinks questions={tip.questions} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
