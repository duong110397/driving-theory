import { apiGet } from './client'

export interface TipQuestionRef {
  number: number
  chapter: number
}

export interface Tip {
  id: string
  chapter: number
  title: string
  points: string[]
  questions: TipQuestionRef[]
}

export interface Myth {
  id: string
  claim: string
  truth: string
  heuristic: string | null
  questions: TipQuestionRef[]
  /** Accuracy of a guessing heuristic, computed by the server over the whole question bank. */
  stats: { applicable: number; correct: number } | null
}

export interface TipBook {
  tips: Tip[]
  myths: Myth[]
}

export const tipsApi = {
  get: (signal?: AbortSignal) => apiGet<TipBook>('/tips/', signal),
}

/** Link that opens a question in the practice tab. */
export const practiceLink = (q: TipQuestionRef) => `/practice/${q.chapter}?so=${q.number}`
