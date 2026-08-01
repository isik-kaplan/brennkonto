export interface User {
  id: string
  email: string
  username: string | null
  display_name: string
  daily_calorie_goal: number
  daily_protein_goal_g: number
  daily_carbs_goal_g: number
  daily_fat_goal_g: number
  updated_at: string | null
}

export interface FoodSearchResult {
  barcode: string
  name: string
  brand: string | null
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  suggested_unit: string
  unit_to_grams: number
}

export interface FoodEntry {
  id: string
  name: string
  brand: string | null
  barcode: string | null
  grams: number
  input_unit: string
  input_amount: number
  unit_to_grams: number
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  consumed_at: string
  created_at: string
  updated_at: string | null
  meal_group_id: string | null
}

export interface MealGroup {
  id: string
  name: string | null
  entry_ids: string[]
}

export interface CreateFoodEntryPayload {
  name: string
  grams: number
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  consumed_at: string
  brand?: string | null
  barcode?: string | null
  input_unit?: string
  input_amount?: number
  unit_to_grams?: number
}

export interface DailyStats {
  date: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  calorie_goal: number
  protein_goal_g: number
  carbs_goal_g: number
  fat_goal_g: number
  entries: FoodEntry[]
}

export type GroupBy = 'day' | 'week' | 'month'

export interface RangeStatsPoint {
  period_label: string
  period_start: string
  period_end: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  days_logged: number
}

export interface RangeStats {
  points: RangeStatsPoint[]
  average_calories: number
  average_protein_g: number
  average_carbs_g: number
  average_fat_g: number
  total_calories: number
  days_in_range: number
  days_logged: number
}
