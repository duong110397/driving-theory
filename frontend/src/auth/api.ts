import { apiGet, apiPost } from '../api/client'

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  is_staff: boolean
}

export interface Credentials {
  username: string
  password: string
}

export const authApi = {
  ensureCsrf: () => apiGet<void>('/auth/csrf/'),
  me: (signal?: AbortSignal) => apiGet<User>('/auth/me/', signal),
  login: (credentials: Credentials) => apiPost<User>('/auth/login/', credentials),
  logout: () => apiPost<void>('/auth/logout/'),
}
