import { api } from './client'
import type {
  CreateFoodEntryPayload,
  DailyStats,
  FoodEntry,
  FoodSearchResult,
  GroupBy,
  MealGroup,
  RangeStats,
  User,
} from './types'

export function register(email: string, password: string, displayName: string) {
  return api.post<User>('/auth/register', { email, password, display_name: displayName })
}

export function login(identifier: string, password: string) {
  return api.post<User>('/auth/login', { identifier, password })
}

export function logout() {
  return api.post<void>('/auth/logout')
}

export function fetchCurrentUser() {
  return api.get<User>('/auth/me')
}

export function updateProfile(displayName: string) {
  return api.patch<User>('/account/profile', { display_name: displayName })
}

export function updateGoals(goals: {
  daily_calorie_goal: number
  daily_protein_goal_g: number
  daily_carbs_goal_g: number
  daily_fat_goal_g: number
}) {
  return api.patch<User>('/account/goals', goals)
}

export function changePassword(currentPassword: string, newPassword: string) {
  return api.post<User>('/account/password', { current_password: currentPassword, new_password: newPassword })
}

export function searchFoods(query: string) {
  return api.get<FoodSearchResult[]>(`/foods/search?q=${encodeURIComponent(query)}`)
}

export function lookupBarcode(barcode: string) {
  return api.get<FoodSearchResult>(`/foods/barcode/${encodeURIComponent(barcode)}`)
}

export function createEntry(payload: CreateFoodEntryPayload) {
  return api.post<FoodEntry>('/entries/', payload)
}

export function updateEntry(id: number, grams: number, consumedAt: string) {
  return api.patch<FoodEntry>(`/entries/${id}`, { grams, consumed_at: consumedAt })
}

export function deleteEntry(id: number) {
  return api.delete<void>(`/entries/${id}`)
}

export function fetchMealGroups() {
  return api.get<MealGroup[]>('/meal-groups/')
}

export function createMealGroup(entryIds: number[], name?: string | null) {
  return api.post<MealGroup>('/meal-groups/', { entry_ids: entryIds, name })
}

export function updateMealGroup(id: string, payload: { entry_ids?: number[]; name?: string | null }) {
  return api.patch<MealGroup>(`/meal-groups/${id}`, payload)
}

export function deleteMealGroup(id: string) {
  return api.delete<void>(`/meal-groups/${id}`)
}

export function fetchDailyStats(date: string) {
  return api.get<DailyStats>(`/stats/daily?date=${date}`)
}

export function fetchRangeStats(start: string, end: string, groupBy: GroupBy) {
  return api.get<RangeStats>(`/stats/range?start=${start}&end=${end}&group_by=${groupBy}`)
}
