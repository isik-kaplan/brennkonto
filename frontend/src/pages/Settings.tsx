import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

import { useFormState } from '@isik-kaplan/core/hooks'

import { ApiError } from '../api/client'
import { changePassword, updateGoals, updateProfile } from '../api/endpoints'
import type { User } from '../api/types'
import { useAuth } from '../hooks/useAuth'

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
        <GoalsCard
          goals={{
            daily_calorie_goal: user.daily_calorie_goal,
            daily_protein_goal_g: user.daily_protein_goal_g,
            daily_carbs_goal_g: user.daily_carbs_goal_g,
            daily_fat_goal_g: user.daily_fat_goal_g,
          }}
          onSaved={setUser}
        />
        <PasswordCard />
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

interface Goals {
  daily_calorie_goal: number
  daily_protein_goal_g: number
  daily_carbs_goal_g: number
  daily_fat_goal_g: number
}

function GoalsCard({ goals, onSaved }: { goals: Goals; onSaved: (user: User) => void }) {
  const { formState, setFormState } = useFormState(goals)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  function handleNumberChange(key: keyof Goals) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value)
      setFormState((prev) => ({ ...prev, [key]: Number.isNaN(value) ? 0 : value }))
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setMessage(null)
    try {
      const user = await updateGoals(formState)
      onSaved(user)
      setMessage({ kind: 'success', text: 'Goals updated.' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError ? error.message : 'Could not save.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="card">
      <h2 className="card__title">Daily goals</h2>
      {message && (
        <div className={message.kind === 'success' ? 'form__banner form__banner--success' : 'form__banner'}>
          {message.text}
        </div>
      )}
      <form className="form" onSubmit={handleSubmit}>
        <div className="form__row">
          <div className="field">
            <label htmlFor="daily_calorie_goal">Calories</label>
            <input
              id="daily_calorie_goal"
              className="input"
              type="number"
              min={0}
              required
              value={formState.daily_calorie_goal}
              onChange={handleNumberChange('daily_calorie_goal')}
            />
          </div>
          <div className="field">
            <label htmlFor="daily_protein_goal_g">Protein (g)</label>
            <input
              id="daily_protein_goal_g"
              className="input"
              type="number"
              min={0}
              required
              value={formState.daily_protein_goal_g}
              onChange={handleNumberChange('daily_protein_goal_g')}
            />
          </div>
        </div>
        <div className="form__row" style={{ marginTop: 'var(--space-md)' }}>
          <div className="field">
            <label htmlFor="daily_carbs_goal_g">Carbs (g)</label>
            <input
              id="daily_carbs_goal_g"
              className="input"
              type="number"
              min={0}
              required
              value={formState.daily_carbs_goal_g}
              onChange={handleNumberChange('daily_carbs_goal_g')}
            />
          </div>
          <div className="field">
            <label htmlFor="daily_fat_goal_g">Fat (g)</label>
            <input
              id="daily_fat_goal_g"
              className="input"
              type="number"
              min={0}
              required
              value={formState.daily_fat_goal_g}
              onChange={handleNumberChange('daily_fat_goal_g')}
            />
          </div>
        </div>
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={isSaving}>
            {isSaving && <span className="btn__spinner" aria-hidden="true" />}
            Save goals
          </button>
        </div>
      </form>
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
