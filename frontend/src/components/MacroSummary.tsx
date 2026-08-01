interface MacroSummaryProps {
  calories: number
  calorieGoal: number
  protein: number
  proteinGoal: number
  carbs: number
  carbsGoal: number
  fat: number
  fatGoal: number
}

const RADIUS = 45
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function clampProgress(value: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.min(value / goal, 1)
}

export default function MacroSummary({
  calories,
  calorieGoal,
  protein,
  proteinGoal,
  carbs,
  carbsGoal,
  fat,
  fatGoal,
}: MacroSummaryProps) {
  const progress = clampProgress(calories, calorieGoal)
  const isOver = calories > calorieGoal
  const remaining = Math.round(calorieGoal - calories)
  const offset = CIRCUMFERENCE * (1 - progress)

  return (
    <div className="calorie-ring">
      <svg
        className="calorie-ring__svg"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${Math.round(calories)} of ${calorieGoal} calories logged`}
      >
        <circle className="calorie-ring__track" cx="50" cy="50" r={RADIUS} />
        <circle
          className={isOver ? 'calorie-ring__value is-over' : 'calorie-ring__value'}
          cx="50"
          cy="50"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
        <text x="50" y="46" className="calorie-ring__center calorie-ring__number">
          {Math.round(calories)}
        </text>
        <text x="50" y="62" className="calorie-ring__center calorie-ring__label">
          {isOver ? `${Math.abs(remaining)} over` : `${remaining} left`}
        </text>
      </svg>

      <div className="macro-bars">
        <MacroBar label="Protein" value={protein} goal={proteinGoal} unit="g" modifier="protein" />
        <MacroBar label="Carbs" value={carbs} goal={carbsGoal} unit="g" modifier="carbs" />
        <MacroBar label="Fat" value={fat} goal={fatGoal} unit="g" modifier="fat" />
      </div>
    </div>
  )
}

function MacroBar({
  label,
  value,
  goal,
  unit,
  modifier,
}: {
  label: string
  value: number
  goal: number
  unit: string
  modifier: string
}) {
  const progress = clampProgress(value, goal)
  return (
    <div>
      <div className="macro-bar__row">
        <span className="macro-bar__label">{label}</span>
        <span className="macro-bar__value numeral">
          {Math.round(value)} / {goal}
          {unit}
        </span>
      </div>
      <div className="macro-bar__track">
        <div className={`macro-bar__fill macro-bar__fill--${modifier}`} style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  )
}
