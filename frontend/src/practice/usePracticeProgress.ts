import { useCallback, useEffect, useState } from 'react'
import { EMPTY_CHAPTER, loadProgress, saveProgress, type ChapterProgress, type PracticeProgress } from './progress'

export interface PracticeProgressApi {
  progress: PracticeProgress
  chapterProgress: (chapter: number) => ChapterProgress
  answer: (chapter: number, question: number, position: number, correct: boolean) => void
  visit: (chapter: number, index: number) => void
  resetChapter: (chapter: number) => void
}

export function usePracticeProgress(userId: number): PracticeProgressApi {
  const [progress, setProgress] = useState<PracticeProgress>(() => loadProgress(userId))

  useEffect(() => {
    saveProgress(userId, progress)
  }, [userId, progress])

  const updateChapter = useCallback(
    (chapter: number, update: (current: ChapterProgress) => ChapterProgress, setLast = false) =>
      setProgress((prev) => ({
        chapters: { ...prev.chapters, [chapter]: update(prev.chapters[chapter] ?? EMPTY_CHAPTER) },
        lastChapter: setLast ? chapter : prev.lastChapter,
      })),
    [],
  )

  const chapterProgress = useCallback(
    (chapter: number) => progress.chapters[chapter] ?? EMPTY_CHAPTER,
    [progress],
  )

  const answer = useCallback(
    (chapter: number, question: number, position: number, correct: boolean) =>
      updateChapter(chapter, (c) => ({ ...c, answers: { ...c.answers, [question]: { position, correct } } })),
    [updateChapter],
  )

  const visit = useCallback(
    (chapter: number, index: number) =>
      setProgress((prev) => {
        const current = prev.chapters[chapter] ?? EMPTY_CHAPTER
        if (current.lastIndex === index && prev.lastChapter === chapter) return prev
        return {
          chapters: { ...prev.chapters, [chapter]: { ...current, lastIndex: index } },
          lastChapter: chapter,
        }
      }),
    [],
  )

  const resetChapter = useCallback(
    (chapter: number) => updateChapter(chapter, () => EMPTY_CHAPTER, true),
    [updateChapter],
  )

  return { progress, chapterProgress, answer, visit, resetChapter }
}
