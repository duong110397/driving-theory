import { NavLink } from 'react-router'
import type { Chapter } from '../api/questions'
import type { PracticeProgress } from './progress'

interface Props {
  chapters: Chapter[]
  progress: PracticeProgress
}

/** One tab per topic; each remembers where the learner left off in it. */
export function ChapterTabs({ chapters, progress }: Props) {
  return (
    <nav className="chapter-tabs" aria-label="Chủ đề">
      {chapters.map((c) => {
        const chapter = progress.chapters[c.number]
        const answered = chapter ? Object.keys(chapter.answers).length : 0
        const resumeAt = Math.min(chapter?.lastIndex ?? 0, Math.max(0, c.question_count - 1))
        return (
          <NavLink key={c.number} to={`/practice/${c.number}?cau=${resumeAt + 1}`} className="chapter-tab" title={c.name}>
            <span className="chapter-tab-name">
              <span className="chapter-tab-number">{c.number}</span>
              {c.name}
            </span>
            <span className="chapter-tab-progress">
              <span className="chapter-tab-bar" aria-hidden="true">
                <span style={{ width: `${c.question_count ? (answered / c.question_count) * 100 : 0}%` }} />
              </span>
              {answered}/{c.question_count}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}
