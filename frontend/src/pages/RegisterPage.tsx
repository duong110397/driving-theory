import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { safeRedirect } from '../auth/redirect'
import type { LoginLocationState } from '../auth/RequireAuth'

type Field = 'username' | 'email' | 'password' | 'confirmPassword'
type FieldErrors = Partial<Record<Field, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(username: string, email: string, password: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!/^[\w.@+-]+$/.test(username)) {
    errors.username = 'Chỉ dùng chữ cái, số và các ký tự @ . + - _'
  }
  if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Email không hợp lệ.'
  }
  if (password.length < 8) {
    errors.password = 'Mật khẩu phải có ít nhất 8 ký tự.'
  }
  if (confirmPassword !== password) {
    errors.confirmPassword = 'Mật khẩu nhập lại không khớp.'
  }
  return errors
}

export function RegisterPage() {
  const { state, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = safeRedirect((location.state as LoginLocationState | null)?.from)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)

  if (state.status === 'authenticated' && !submitting) {
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedUsername = username.trim()
    const trimmedEmail = email.trim()

    const clientErrors = validate(trimmedUsername, trimmedEmail, password, confirmPassword)
    setFieldErrors(clientErrors)
    setError(null)
    if (Object.keys(clientErrors).length > 0) return

    setSubmitting(true)
    try {
      await register({ username: trimmedUsername, email: trimmedEmail, password })
      navigate(redirectTo, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Bạn đã đăng ký quá nhiều lần. Vui lòng thử lại sau.')
      } else if (err instanceof ApiError && err.status < 500) {
        const { username: u, email: e, password: p } = err.fieldErrors
        const serverErrors: FieldErrors = { username: u?.[0], email: e?.[0], password: p?.join(' ') }
        setFieldErrors(serverErrors)
        if (!u && !e && !p) setError(err.message)
      } else {
        setError('Không kết nối được máy chủ. Vui lòng thử lại.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const fieldProps = (field: Field) => ({
    'aria-invalid': fieldErrors[field] ? true : undefined,
    'aria-describedby': fieldErrors[field] ? `${field}-error` : undefined,
  })

  const fieldError = (field: Field) =>
    fieldErrors[field] && (
      <p id={`${field}-error`} className="field-error">
        {fieldErrors[field]}
      </p>
    )

  return (
    <main className="auth-page">
      <form className="card" onSubmit={handleSubmit} noValidate>
        <h1>Đăng ký</h1>

        <label htmlFor="username">Tên đăng nhập</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          autoFocus
          required
          maxLength={150}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={submitting}
          {...fieldProps('username')}
        />
        {fieldError('username')}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          {...fieldProps('email')}
        />
        {fieldError('email')}

        <label htmlFor="password">Mật khẩu</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          {...fieldProps('password')}
        />
        {fieldError('password')}

        <label htmlFor="confirmPassword">Nhập lại mật khẩu</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={submitting}
          {...fieldProps('confirmPassword')}
        />
        {fieldError('confirmPassword')}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !username.trim() || !email.trim() || !password || !confirmPassword}
        >
          {submitting ? 'Đang tạo tài khoản…' : 'Đăng ký'}
        </button>

        <p className="auth-switch">
          Đã có tài khoản?{' '}
          <Link to="/login" state={location.state}>
            Đăng nhập
          </Link>
        </p>
      </form>
    </main>
  )
}
