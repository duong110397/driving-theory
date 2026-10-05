import { apiGet, apiPost, apiRequest } from './client'

export interface ExamRule {
  license_class: string
  total_questions: number
  duration_minutes: number
  pass_score: number
  sections: { label: string; count: number }[]
}

export interface ExamOption {
  position: number
  text: string
}

export interface ExamItem {
  order: number
  number: number
  content: string
  image: string | null
  image_type: string
  options: ExamOption[]
  selected_position: number | null
  // Present only once the exam has been submitted
  correct_position?: number
  is_correct?: boolean
  is_critical?: boolean
}

export type ExamStatus = 'in_progress' | 'submitted'

export interface ExamSummary {
  id: string
  license_class: string
  status: ExamStatus
  total_questions: number
  pass_score: number
  duration_seconds: number
  started_at: string
  expires_at: string
  submitted_at: string | null
  score: number | null
  failed_critical: boolean | null
  passed: boolean | null
}

export interface Exam extends ExamSummary {
  remaining_seconds: number
  items: ExamItem[]
}

export interface Page<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type Answers = Record<number, number | null>

export const examsApi = {
  rules: () => apiGet<ExamRule[]>('/exams/rules/'),
  list: (page = 1) => apiGet<Page<ExamSummary>>(`/exams/?page=${page}`),
  get: (id: string, signal?: AbortSignal) => apiGet<Exam>(`/exams/${encodeURIComponent(id)}/`, signal),
  create: (licenseClass: string) => apiPost<Exam>('/exams/', { license_class: licenseClass }),
  saveAnswer: (id: string, question: number, position: number | null) =>
    apiRequest<void>('PUT', `/exams/${encodeURIComponent(id)}/answers/`, { body: { question, position } }),
  submit: (id: string, answers: Answers) =>
    apiPost<Exam>(`/exams/${encodeURIComponent(id)}/submit/`, {
      answers: Object.entries(answers).map(([question, position]) => ({ question: Number(question), position })),
    }),
}

/** License classes grouped the way learners think about them. */
export const LICENSE_GROUPS: { title: string; description: string; classes: string[] }[] = [
  { title: 'Xe mô tô', description: 'Xe máy, xe mô tô hai và ba bánh', classes: ['A1', 'A', 'B1'] },
  { title: 'Xe ô tô', description: 'Ô tô con, ô tô tải', classes: ['B', 'C1', 'C'] },
  { title: 'Xe chở người', description: 'Ô tô khách các cỡ', classes: ['D1', 'D2', 'D'] },
  { title: 'Kéo rơ moóc', description: 'Các hạng kéo rơ moóc, sơ mi rơ moóc', classes: ['BE', 'C1E', 'CE', 'D1E', 'D2E', 'DE'] },
]

export const LICENSE_DESCRIPTIONS: Record<string, string> = {
  A1: 'Mô tô đến 125 cm³',
  A: 'Mô tô trên 125 cm³',
  B1: 'Mô tô ba bánh',
  B: 'Ô tô đến 8 chỗ, tải đến 3,5 tấn',
  C1: 'Ô tô tải 3,5 – 7,5 tấn',
  C: 'Ô tô tải trên 7,5 tấn',
  D1: 'Ô tô 8 – 16 chỗ',
  D2: 'Ô tô 16 – 29 chỗ',
  D: 'Ô tô trên 29 chỗ',
  BE: 'Hạng B kéo rơ moóc',
  C1E: 'Hạng C1 kéo rơ moóc',
  CE: 'Hạng C kéo rơ moóc',
  D1E: 'Hạng D1 kéo rơ moóc',
  D2E: 'Hạng D2 kéo rơ moóc',
  DE: 'Hạng D kéo rơ moóc',
}
