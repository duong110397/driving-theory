/**
 * Practice progress, kept per user in localStorage. It is a convenience only: the page works
 * (with empty progress) when storage is unavailable, e.g. in a private window.
 */

export interface AnswerRecord {
  position: number
  correct: boolean
}

export interface ChapterProgress {
  /** Keyed by question number. */
  answers: Record<number, AnswerRecord>
  /** Index of the question last viewed in this chapter, to resume there. */
  lastIndex: number
}

export interface PracticeProgress {
  chapters: Record<number, ChapterProgress>
  lastChapter: number | null
}

export const EMPTY_PROGRESS: PracticeProgress = { chapters: {}, lastChapter: null }
export const EMPTY_CHAPTER: ChapterProgress = { answers: {}, lastIndex: 0 }

const storageKey = (userId: number) => `practice:v1:${userId}`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseChapter(value: unknown): ChapterProgress | null {
  if (!isRecord(value) || !isRecord(value.answers)) return null
  const answers: Record<number, AnswerRecord> = {}
  for (const [number, record] of Object.entries(value.answers)) {
    if (isRecord(record) && typeof record.position === 'number' && typeof record.correct === 'boolean') {
      answers[Number(number)] = { position: record.position, correct: record.correct }
    }
  }
  const lastIndex = typeof value.lastIndex === 'number' && value.lastIndex >= 0 ? Math.floor(value.lastIndex) : 0
  return { answers, lastIndex }
}

/** Reads stored progress, dropping anything malformed instead of failing. */
export function loadProgress(userId: number): PracticeProgress {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return EMPTY_PROGRESS
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || !isRecord(data.chapters)) return EMPTY_PROGRESS
    const chapters: Record<number, ChapterProgress> = {}
    for (const [number, chapter] of Object.entries(data.chapters)) {
      const parsed = parseChapter(chapter)
      if (parsed) chapters[Number(number)] = parsed
    }
    const lastChapter = typeof data.lastChapter === 'number' ? data.lastChapter : null
    return { chapters, lastChapter }
  } catch {
    return EMPTY_PROGRESS
  }
}

export function saveProgress(userId: number, progress: PracticeProgress): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(progress))
  } catch {
    // Storage full or blocked: progress just won't survive a reload.
  }
}
