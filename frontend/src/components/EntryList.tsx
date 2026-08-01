import type { FoodEntry } from '../api/types'

interface EntryListProps {
  entries: FoodEntry[]
  onDelete: (entry: FoodEntry) => void
  deletingId?: number | null
  emptyMessage?: string
}

export default function EntryList({ entries, onDelete, deletingId, emptyMessage }: EntryListProps) {
  if (entries.length === 0) {
    return <div className="empty-state">{emptyMessage ?? 'Nothing logged yet.'}</div>
  }

  return (
    <ul className="entry-list">
      {entries.map((entry) => (
        <li key={entry.id} className="entry-row">
          <div>
            <div className="entry-row__name">{entry.name}</div>
            <div className="entry-row__meta">
              {entry.brand ? `${entry.brand} · ` : ''}
              {entry.input_unit === 'g' ? (
                `${entry.grams}g`
              ) : (
                <>
                  {entry.input_amount} {entry.input_unit} (≈{Math.round(entry.grams)}g)
                </>
              )}{' '}
              · P{Math.round(entry.protein_g)} C{Math.round(entry.carbs_g)} F{Math.round(entry.fat_g)}
            </div>
          </div>
          <div className="entry-row__calories numeral">{Math.round(entry.calories)} kcal</div>
          <div className="entry-row__actions">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onDelete(entry)}
              disabled={deletingId === entry.id}
              aria-label={`Delete ${entry.name}`}
            >
              {deletingId === entry.id ? <span className="btn__spinner" aria-hidden="true" /> : 'Remove'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
