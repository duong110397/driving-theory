import { apiGet } from './client'
import type { ExamSummary, Page } from './exams'

export interface AdminUser {
  id: number
  username: string
  email: string
  is_active: boolean
  is_staff: boolean
  is_superuser: boolean
  date_joined: string
  last_login: string | null
  exam_count: number
  passed_count: number
  last_exam_at: string | null
}

export interface AdminUserDetail extends AdminUser {
  recent_exams: ExamSummary[]
}

export interface AdminStats {
  users: { total: number; staff: number; new_7d: number; active_7d: number }
  exams: { total: number; submitted: number; passed: number; last_7d: number }
}

export type UserOrdering = 'date_joined' | 'last_login' | 'username' | 'exam_count'
export type UserRole = 'staff' | 'user'

export interface UserQuery {
  page: number
  search: string
  ordering: UserOrdering
  descending: boolean
  role: UserRole | null
}

export const adminApi = {
  stats: (signal?: AbortSignal) => apiGet<AdminStats>('/admin/stats/', signal),
  users: (q: UserQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams({ page: String(q.page), ordering: `${q.descending ? '-' : ''}${q.ordering}` })
    if (q.search) params.set('search', q.search)
    if (q.role) params.set('role', q.role)
    return apiGet<Page<AdminUser>>(`/admin/users/?${params}`, signal)
  },
  user: (id: number, signal?: AbortSignal) => apiGet<AdminUserDetail>(`/admin/users/${id}/`, signal),
}
