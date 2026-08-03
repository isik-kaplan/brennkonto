import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { useFormState } from '@isik-kaplan/core/hooks'
import { Link } from 'react-router'

import { ApiError } from '../api/client'
import { changePassword, fetchDailyStats, updateProfile } from '../api/endpoints'
import type { User } from '../api/types'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../hooks/useAuth'
import { toISODate } from '../lib/dates'

export default function Settings() {
  const { user, setUser, logout } = useAuth()
  if (!user) return null

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="grid grid--2">
        <ProfileCard displayName={user.display_name} onSaved={setUser} />
        <GoalsCard />
        <PasswordCard />
        <div className="card">
          <h2 className="card__title">Appearance</h2>
          <ThemeToggle />
        </div>
        <div className="card">
          <h2 className="card__title">Session</h2>
          <p style={{ marginBottom: 'var(--space-md)' }}>Signed in as {user.email}.</p>
          <button type="button" className="btn btn--danger" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </div>
    </>
  )
}

function ProfileCard({ displayName, onSaved }: { displayName: string; onSaved: (user: User) => void }) {
  const { formState, handleFormStateEvent } = useFormState({ display_name: displayName })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setMessage(null)
    try {
      const user = await updateProfile(formState.display_name)
      onSaved(user)
      setMessage({ kind: 'success', text: 'Saved.' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError ? error.message : 'Could not save.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="card">
      <h2 className="card__title">Profile</h2>
      {message && (
        <div className={message.kind === 'success' ? 'form__banner form__banner--success' : 'form__banner'}>
          {message.text}
        </div>
      )}
      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="display_name">Name</label>
          <input
            id="display_name"
            className="input"
            type="text"
            required
            value={formState.display_name}
            onChange={handleFormStateEvent('display_name')}
          />
        </div>
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={isSaving}>
            {isSaving && <span className="btn__spinner" aria-hidden="true" />}
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

// A lightweight "what's active right now" summary, not a management UI - adding/editing/removing
// dated goals is deliberately one click further away on its own page (GoalHistory.tsx), not
// inline in Settings, so day-to-day Settings stays uncluttered by something most visits don't
// need. Reads via fetchDailyStats rather than the goals list so it never has to duplicate the
// backend's own resolve-goal-for-a-date/fallback-to-defaults logic.
function GoalsCard() {
  const [goal, setGoal] = useState<{
    calorie_goal: number
    protein_goal_g: number
    carbs_goal_g: number
    fat_goal_g: number
  } | null>(null)

  useEffect(() => {
    fetchDailyStats(toISODate(new Date())).then((stats) => {
      setGoal({
        calorie_goal: stats.calorie_goal,
        protein_goal_g: stats.protein_goal_g,
        carbs_goal_g: stats.carbs_goal_g,
        fat_goal_g: stats.fat_goal_g,
      })
    })
  }, [])

  return (
    <div className="card">
      <h2 className="card__title">Daily goals</h2>
      {goal && (
        <p className="entry-row__meta" style={{ marginBottom: 'var(--space-md)' }}>
          {goal.calorie_goal} kcal · P{goal.protein_goal_g} C{goal.carbs_goal_g} F{goal.fat_goal_g}
        </p>
      )}
      <Link to="/settings/goals" className="btn btn--ghost">
        Manage goals →
      </Link>
    </div>
  )
}

function PasswordCard() {
  const { formState, handleFormStateEvent, resetFormState } = useFormState({
    current_password: '',
    new_password: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setMessage(null)
    try {
      await changePassword(formState.current_password, formState.new_password)
      resetFormState()
      setMessage({ kind: 'success', text: 'Password changed.' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError ? error.message : 'Could not change password.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="card">
      <h2 className="card__title">Password</h2>
      {message && (
        <div className={message.kind === 'success' ? 'form__banner form__banner--success' : 'form__banner'}>
          {message.text}
        </div>
      )}
      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="current_password">Current password</label>
          <input
            id="current_password"
            className="input"
            type="password"
            required
            autoComplete="current-password"
            value={formState.current_password}
            onChange={handleFormStateEvent('current_password')}
          />
        </div>
        <div className="field">
          <label htmlFor="new_password">New password</label>
          <input
            id="new_password"
            className="input"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={formState.new_password}
            onChange={handleFormStateEvent('new_password')}
          />
        </div>
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={isSaving}>
            {isSaving && <span className="btn__spinner" aria-hidden="true" />}
            Change password
          </button>
        </div>
      </form>
    </div>
  )
}
