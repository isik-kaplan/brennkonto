import { useState } from 'react'

import type { FoodEntry, MealGroup } from '../api/types'
import { displayTime, fromDatetimeLocalValue, toDatetimeLocalValue } from '../lib/dates'
import ConfirmDialog from './ConfirmDialog'

interface EntryListProps {
  entries: FoodEntry[]
  onDelete: (entry: FoodEntry) => void
  deletingId?: string | null
  emptyMessage?: string
  groups?: MealGroup[]
  selectable?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (entry: FoodEntry) => void
  onUngroup?: (groupId: string) => void
  onUpdateConsumedAt?: (entry: FoodEntry, consumedAt: string) => void
}

interface Cluster {
  groupId: string | null
  entries: FoodEntry[]
}

// Clusters entries that share a meal_group_id together, in first-appearance order, while leaving
// ungrouped entries as their own single-entry cluster - this is independent of when each entry
// was logged, which is what makes grouping retroactive.
function clusterEntries(entries: FoodEntry[]): Cluster[] {
  const clusters: Cluster[] = []
  const byGroupId = new Map<string, Cluster>()
  for (const entry of entries) {
    if (entry.meal_group_id) {
      let cluster = byGroupId.get(entry.meal_group_id)
      if (!cluster) {
        cluster = { groupId: entry.meal_group_id, entries: [] }
        byGroupId.set(entry.meal_group_id, cluster)
        clusters.push(cluster)
      }
      cluster.entries.push(entry)
    } else {
      clusters.push({ groupId: null, entries: [entry] })
    }
  }
  return clusters
}

export default function EntryList({
  entries,
  onDelete,
  deletingId,
  emptyMessage,
  groups,
  selectable,
  selectedIds,
  onToggleSelect,
  onUngroup,
  onUpdateConsumedAt,
}: EntryListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDatetime, setEditDatetime] = useState('')
  const [pendingDelete, setPendingDelete] = useState<FoodEntry | null>(null)

  if (entries.length === 0) {
    return <div className="empty-state">{emptyMessage ?? 'Nothing logged yet.'}</div>
  }

  function startEditing(entry: FoodEntry) {
    setEditingId(entry.id)
    setEditDatetime(toDatetimeLocalValue(entry.consumed_at))
  }

  function saveEdit(entry: FoodEntry) {
    onUpdateConsumedAt?.(entry, fromDatetimeLocalValue(editDatetime))
    setEditingId(null)
  }

  function renderNameAndMeta(entry: FoodEntry) {
    return (
      <div>
        <div className="entry-row__name">{entry.name}</div>
        <div className="entry-row__meta">
          <span className="numeral">{displayTime(entry.consumed_at)}</span> ·{' '}
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
    )
  }

  function renderRow(entry: FoodEntry) {
    if (editingId === entry.id) {
      return (
        <li key={entry.id} className="entry-row entry-row--editing">
          {renderNameAndMeta(entry)}
          <div className="field">
            <label htmlFor={`edit-datetime-${entry.id}`}>Logged at</label>
            <input
              id={`edit-datetime-${entry.id}`}
              className="input"
              type="datetime-local"
              value={editDatetime}
              onChange={(event) => setEditDatetime(event.target.value)}
            />
          </div>
          <div className="entry-row__actions">
            <button type="button" className="btn btn--primary btn--small" onClick={() => saveEdit(entry)}>
              Save
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditingId(null)}>
              Cancel
            </button>
          </div>
        </li>
      )
    }

    return (
      <li key={entry.id} className={selectable ? 'entry-row entry-row--selectable' : 'entry-row'}>
        {selectable && (
          <input
            type="checkbox"
            aria-label={`Select ${entry.name}`}
            checked={selectedIds?.has(entry.id) ?? false}
            onChange={() => onToggleSelect?.(entry)}
          />
        )}
        {renderNameAndMeta(entry)}
        <div className="entry-row__calories numeral">{Math.round(entry.calories)} kcal</div>
        <div className="entry-row__actions">
          {onUpdateConsumedAt && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => startEditing(entry)}
              aria-label={`Edit when ${entry.name} was logged`}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setPendingDelete(entry)}
            disabled={deletingId === entry.id}
            aria-label={`Delete ${entry.name}`}
          >
            {deletingId === entry.id ? <span className="btn__spinner" aria-hidden="true" /> : 'Remove'}
          </button>
        </div>
      </li>
    )
  }

  return (
    <>
      <ul className="entry-list">
        {clusterEntries(entries).map((cluster) =>
          cluster.groupId === null ? (
            renderRow(cluster.entries[0])
          ) : (
            <li key={cluster.groupId} className="meal-group">
              <div className="meal-group__header">
                <span>{groups?.find((group) => group.id === cluster.groupId)?.name ?? 'Meal'}</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => onUngroup?.(cluster.groupId!)}
                >
                  Ungroup
                </button>
              </div>
              <ul className="entry-list">{cluster.entries.map((entry) => renderRow(entry))}</ul>
            </li>
          )
        )}
      </ul>
      {pendingDelete && (
        <ConfirmDialog
          title="Remove this entry?"
          message={`"${pendingDelete.name}" will be moved to your archive, where you can restore or permanently delete it.`}
          confirmLabel="Remove"
          isDestructive
          onConfirm={() => {
            onDelete(pendingDelete)
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  )
}
