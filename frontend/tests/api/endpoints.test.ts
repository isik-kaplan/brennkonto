import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'

vi.mock('../../src/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
  vi.mocked(api.patch).mockReset()
  vi.mocked(api.delete).mockReset()
})

describe('auth endpoints', () => {
  it('register posts email/password/display_name', () => {
    endpoints.register('a@b.com', 'secret', 'Ada')
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      email: 'a@b.com',
      password: 'secret',
      display_name: 'Ada',
    })
  })

  it('login posts identifier/password', () => {
    endpoints.login('a@b.com', 'secret')
    expect(api.post).toHaveBeenCalledWith('/auth/login', { identifier: 'a@b.com', password: 'secret' })
  })

  it('logout posts with no body', () => {
    endpoints.logout()
    expect(api.post).toHaveBeenCalledWith('/auth/logout')
  })

  it('fetchCurrentUser gets /auth/me', () => {
    endpoints.fetchCurrentUser()
    expect(api.get).toHaveBeenCalledWith('/auth/me')
  })
})

describe('account endpoints', () => {
  it('updateProfile patches display_name', () => {
    endpoints.updateProfile('Ada')
    expect(api.patch).toHaveBeenCalledWith('/account/profile', { display_name: 'Ada' })
  })

  it('changePassword posts current and new password', () => {
    endpoints.changePassword('old', 'new')
    expect(api.post).toHaveBeenCalledWith('/account/password', {
      current_password: 'old',
      new_password: 'new',
    })
  })
})

describe('food endpoints', () => {
  it('searchFoods URL-encodes the query', () => {
    endpoints.searchFoods('greek yogurt')
    expect(api.get).toHaveBeenCalledWith('/foods/search?q=greek%20yogurt')
  })

  it('lookupBarcode URL-encodes the barcode', () => {
    endpoints.lookupBarcode('123 456')
    expect(api.get).toHaveBeenCalledWith('/foods/barcode/123%20456')
  })
})

describe('entry endpoints', () => {
  const payload = {
    name: 'Banana',
    grams: 120,
    calories_per_100g: 89,
    protein_per_100g: 1.1,
    carbs_per_100g: 22.8,
    fat_per_100g: 0.3,
    consumed_at: '2026-08-01',
  }

  it('createEntry posts the full payload', () => {
    endpoints.createEntry(payload)
    expect(api.post).toHaveBeenCalledWith('/entries/', payload)
  })

  it('updateEntry patches grams and consumed_at by id', () => {
    endpoints.updateEntry('5', 150, '2026-08-02')
    expect(api.patch).toHaveBeenCalledWith('/entries/5', { grams: 150, consumed_at: '2026-08-02' })
  })

  it('deleteEntry deletes by id', () => {
    endpoints.deleteEntry('5')
    expect(api.delete).toHaveBeenCalledWith('/entries/5')
  })

  it('moveEntryToGroup posts the target group id', () => {
    endpoints.moveEntryToGroup('5', 'g1')
    expect(api.post).toHaveBeenCalledWith('/entries/5/group', { target_group_id: 'g1' })
  })

  it('fetchArchivedEntries gets the archive endpoint with a date query', () => {
    endpoints.fetchArchivedEntries('2026-08-01')
    expect(api.get).toHaveBeenCalledWith('/entries/archive?date=2026-08-01')
  })

  it('restoreEntry posts to the restore endpoint by id', () => {
    endpoints.restoreEntry('5')
    expect(api.post).toHaveBeenCalledWith('/entries/5/restore')
  })

  it('permanentlyDeleteEntry deletes the permanent endpoint by id', () => {
    endpoints.permanentlyDeleteEntry('5')
    expect(api.delete).toHaveBeenCalledWith('/entries/5/permanent')
  })
})

describe('meal group endpoints', () => {
  it('fetchMealGroups gets the meal-groups list', () => {
    endpoints.fetchMealGroups()
    expect(api.get).toHaveBeenCalledWith('/meal-groups/')
  })

  it('createMealGroup posts entry_ids and name', () => {
    endpoints.createMealGroup(['1', '2'], 'Breakfast')
    expect(api.post).toHaveBeenCalledWith('/meal-groups/', { entry_ids: ['1', '2'], name: 'Breakfast' })
  })

  it('updateMealGroup patches the group by id', () => {
    endpoints.updateMealGroup('g1', { name: 'Brunch' })
    expect(api.patch).toHaveBeenCalledWith('/meal-groups/g1', { name: 'Brunch' })
  })

  it('deleteMealGroup deletes the group by id', () => {
    endpoints.deleteMealGroup('g1')
    expect(api.delete).toHaveBeenCalledWith('/meal-groups/g1')
  })
})

describe('goal version endpoints', () => {
  it('fetchGoalVersions gets the goals list', () => {
    endpoints.fetchGoalVersions()
    expect(api.get).toHaveBeenCalledWith('/goals')
  })

  it('upsertGoalVersion posts the effective date and goal values', () => {
    const payload = {
      effective_date: '2026-08-01',
      daily_calorie_goal: 2000,
      daily_protein_goal_g: 150,
      daily_carbs_goal_g: 200,
      daily_fat_goal_g: 65,
    }
    endpoints.upsertGoalVersion(payload)
    expect(api.post).toHaveBeenCalledWith('/goals', payload)
  })

  it('deleteGoalVersion deletes the version by id', () => {
    endpoints.deleteGoalVersion('g1')
    expect(api.delete).toHaveBeenCalledWith('/goals/g1')
  })
})

describe('favorite endpoints', () => {
  it('fetchFavorites gets the favorites list', () => {
    endpoints.fetchFavorites()
    expect(api.get).toHaveBeenCalledWith('/favorites')
  })

  it('upsertFavorite posts the favorite payload', () => {
    const payload = {
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      calories_per_100g: 539,
      protein_per_100g: 6.3,
      carbs_per_100g: 57.5,
      fat_per_100g: 30.9,
      default_input_unit: 'g',
      default_input_amount: 30,
      default_unit_to_grams: 1,
    }
    endpoints.upsertFavorite(payload)
    expect(api.post).toHaveBeenCalledWith('/favorites', payload)
  })

  it('deleteFavorite deletes by id', () => {
    endpoints.deleteFavorite('f1')
    expect(api.delete).toHaveBeenCalledWith('/favorites/f1')
  })
})

describe('stats endpoints', () => {
  it('fetchDailyStats gets the daily endpoint with a date query', () => {
    endpoints.fetchDailyStats('2026-08-01')
    expect(api.get).toHaveBeenCalledWith('/stats/daily?date=2026-08-01')
  })

  it('fetchRangeStats gets the range endpoint with start/end/group_by', () => {
    endpoints.fetchRangeStats('2026-07-01', '2026-08-01', 'week')
    expect(api.get).toHaveBeenCalledWith('/stats/range?start=2026-07-01&end=2026-08-01&group_by=week')
  })
})
