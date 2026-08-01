import { useState } from 'react'
import type { FormEvent } from 'react'

import { useFormState } from '@isik-kaplan/core/hooks'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const { formState, handleFormStateEvent } = useFormState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login(formState.email, formState.password)
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="auth-card__brand">
          <span className="app-nav__brand-mark" aria-hidden="true" />
          brennkonto
        </span>
        <h1>Welcome back</h1>
        <p className="auth-card__subtitle">Log in to keep tracking what you eat.</p>

        {error && <div className="form__banner">{error}</div>}

        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              required
              autoComplete="email"
              value={formState.email}
              onChange={handleFormStateEvent('email')}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              required
              autoComplete="current-password"
              value={formState.password}
              onChange={handleFormStateEvent('password')}
            />
          </div>
          <div className="form__actions">
            <button type="submit" className="btn btn--primary btn--block" disabled={isSubmitting}>
              {isSubmitting && <span className="btn__spinner" aria-hidden="true" />}
              Log in
            </button>
          </div>
        </form>

        <p className="auth-card__switch">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  )
}
