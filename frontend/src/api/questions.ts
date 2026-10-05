import { apiGet } from './client'
import type { Page } from './exams'

export interface Chapter {
  number: number
  name: string
  question_count: number
}

export interface QuestionOption {
  position: number
  text: string
  is_correct: boolean
}

export interface Question {
  number: number
  chapter: number
  content: string
  image: string | null
  image_type: string
  is_critical: boolean
  options: QuestionOption[]
}

/** Server-side maximum (QuestionPagination.max_page_size). */
const PAGE_SIZE = 100

export const questionsApi = {
  chapters: (signal?: AbortSignal) => apiGet<Chapter[]>('/chapters/', signal),

  /** All questions of one chapter, following pagination (the largest chapter has ~185). */
  async listByChapter(chapter: number, signal?: AbortSignal): Promise<Question[]> {
    const questions: Question[] = []
    for (let page = 1; ; page++) {
      const data = await apiGet<Page<Question>>(
        `/questions/?chapter=${chapter}&page=${page}&page_size=${PAGE_SIZE}`,
        signal,
      )
      questions.push(...data.results)
      if (!data.next) return questions
    }
  },
}
