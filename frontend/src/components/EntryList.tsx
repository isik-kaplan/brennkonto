import type { ReactNode } from 'react'
import { useState } from 'react'

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'

import type { FoodEntry, MealGroup } from '../api/types'
import { displayTime, fromDatetimeLocalValue, toDatetimeLocalValue } from '../lib/dates'
import ConfirmDialog from './ConfirmDialog'

interface EntryListProps {
  entries: FoodEntry[]
  onDelete: (entry: FoodEntry) => void
  deletingId?: string | null
  emptyMessage?: string
  groups?: MealGroup[]
  onMoveEntry?: (entry: FoodEntry, targetGroupId: string) => void
  onRenameGroup?: (groupId: string, name: string) => void
  onUngroup?: (groupId: string) => void
  onUpdateConsumedAt?: (entry: FoodEntry, consumedAt: string) => void
}

interface Cluster {
  groupId: string | null
  entries: FoodEntry[]
}

// Clusters entries that share a meal_group_id together, in first-appearance order - this is
// independent of when each entry was logged, which is what makes grouping retroactive. Every
// entry always belongs to a real group in practice; the null-groupId branch only exists as a
// defensive fallback for stale/unexpected data, not a state the app itself produces.
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

function nameAndMeta(entry: FoodEntry, handle?: ReactNode) {
  return (
    <div className="entry-row__info">
      {handle}
      <div>
        <div className="entry-row__name">{entry.name}</div>
        <div className="entry-row__meta">
          <span className="numeral">{displayTime(entry.consumed_at)}</span> · {entry.brand ? `${entry.brand} · ` : ''}
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
    </div>
  )
}

// A small dedicated grab target, rather than making the whole row a drag source - so touch
// scrolling through the list still works normally (touch-action: none only applies to this
// handle) and it's unambiguous what to grab, especially on mobile where there's no hover cursor
// to hint "this whole row is draggable".
interface DragHandleProps {
  entryName: string
  listeners: ReturnType<typeof useDraggable>['listeners']
  attributes: ReturnType<typeof useDraggable>['attributes']
}

function DragHandle({ entryName, listeners, attributes }: DragHandleProps) {
  return (
    <button
      type="button"
      className="entry-row__handle"
      aria-label={`Drag to move ${entryName}`}
      {...listeners}
      {...attributes}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="7" cy="5" r="1.3" />
        <circle cx="13" cy="5" r="1.3" />
        <circle cx="7" cy="10" r="1.3" />
        <circle cx="13" cy="10" r="1.3" />
        <circle cx="7" cy="15" r="1.3" />
        <circle cx="13" cy="15" r="1.3" />
      </svg>
    </button>
  )
}

interface EntryRowProps {
  entry: FoodEntry
  isEditing: boolean
  editDatetime: string
  onEditDatetimeChange: (value: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  deletingId?: string | null
  showEdit: boolean
}

// Every row is both a drag source (id = the entry) and a drop target (id = the entry's current
// group) - dropping one entry onto any row belonging to a group merges it into that same group,
// so a multi-item box needs no separate box-level drop target of its own.
function EntryRow({
  entry,
  isEditing,
  editDatetime,
  onEditDatetimeChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  deletingId,
  showEdit,
}: EntryRowProps) {
  const draggable = useDraggable({ id: entry.id, disabled: isEditing })
  const droppable = useDroppable({ id: entry.meal_group_id ?? entry.id })

  function setRefs(node: HTMLLIElement | null) {
    draggable.setNodeRef(node)
    droppable.setNodeRef(node)
  }

  const style = draggable.transform
    ? { transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)` }
    : undefined

  if (isEditing) {
    return (
      <li key={entry.id} className="entry-row entry-row--editing" ref={setRefs} style={style}>
        {nameAndMeta(entry)}
        <div className="field">
          <label htmlFor={`edit-datetime-${entry.id}`}>Logged at</label>
          <input
            id={`edit-datetime-${entry.id}`}
            className="input"
            type="datetime-local"
            value={editDatetime}
            onChange={(event) => onEditDatetimeChange(event.target.value)}
          />
        </div>
        <div className="entry-row__actions">
          <button type="button" className="btn btn--primary btn--small" onClick={onSaveEdit}>
            Save
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={onCancelEdit}>
            Cancel
          </button>
        </div>
      </li>
    )
  }

  return (
    <li
      key={entry.id}
      className={
        'entry-row entry-row--draggable' +
        (draggable.isDragging ? ' is-dragging' : '') +
        (droppable.isOver ? ' entry-row--drag-over' : '')
      }
      ref={setRefs}
      style={style}
    >
      {nameAndMeta(
        entry,
        <DragHandle entryName={entry.name} listeners={draggable.listeners} attributes={draggable.attributes} />
      )}
      <div className="entry-row__calories numeral">{Math.round(entry.calories)} kcal</div>
      <div className="entry-row__actions">
        {showEdit && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={onStartEdit}
            aria-label={`Edit when ${entry.name} was logged`}
          >
            Edit
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={onDelete}
          disabled={deletingId === entry.id}
          aria-label={`Delete ${entry.name}`}
        >
          {deletingId === entry.id ? <span className="btn__spinner" aria-hidden="true" /> : 'Remove'}
        </button>
      </div>
    </li>
  )
}

export default function EntryList({
  entries,
  onDelete,
  deletingId,
  emptyMessage,
  groups,
  onMoveEntry,
  onRenameGroup,
  onUngroup,
  onUpdateConsumedAt,
}: EntryListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDatetime, setEditDatetime] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<FoodEntry | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

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

  function startRenaming(groupId: string, currentName: string | null) {
    setRenamingGroupId(groupId)
    setRenameValue(currentName ?? '')
  }

  function saveRename(groupId: string) {
    onRenameGroup?.(groupId, renameValue.trim())
    setRenamingGroupId(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    // dnd-kit only ever reports an active/over pair for a currently-mounted, registered
    // draggable, which is always rendered 1:1 from the current entries prop (and dnd-kit cancels
    // the drag outright if the dragged node unmounts mid-drag) - so this is always found.
    const draggedEntry = entries.find((entry) => entry.id === active.id)!
    const targetGroupId = String(over.id)
    if (draggedEntry.meal_group_id === targetGroupId) return
    onMoveEntry?.(draggedEntry, targetGroupId)
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <ul className="entry-list">
          {clusterEntries(entries).map((cluster) => {
            const group = groups?.find((candidate) => candidate.id === cluster.groupId)
            const isRenaming = cluster.groupId !== null && renamingGroupId === cluster.groupId

            const rows = cluster.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                isEditing={editingId === entry.id}
                editDatetime={editDatetime}
                onEditDatetimeChange={setEditDatetime}
                onStartEdit={() => startEditing(entry)}
                onSaveEdit={() => saveEdit(entry)}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => setPendingDelete(entry)}
                deletingId={deletingId}
                showEdit={Boolean(onUpdateConsumedAt)}
              />
            ))

            // Every entry always belongs to a real MealGroup (even a group of one), so every
            // cluster renders boxed - that's what makes a lone entry nameable the same way a
            // multi-item group is. The null-groupId branch only exists as a defensive fallback for
            // stale/unexpected data that has no real group to box or name.
            if (cluster.groupId === null) {
              return rows
            }
            const groupId = cluster.groupId

            return (
              <li key={groupId} className="meal-group">
                <div className="meal-group__header">
                  {isRenaming ? (
                    <input
                      className="input"
                      type="text"
                      autoFocus
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={() => saveRename(groupId)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveRename(groupId)
                        if (event.key === 'Escape') setRenamingGroupId(null)
                      }}
                    />
                  ) : onRenameGroup ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className={group?.name ? undefined : 'meal-group__header-placeholder'}
                      onClick={() => startRenaming(groupId, group?.name ?? null)}
                    >
                      {group?.name || 'Name this meal'}
                    </span>
                  ) : (
                    <span>{group?.name}</span>
                  )}
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => onUngroup?.(groupId)}>
                    Ungroup
                  </button>
                </div>
                <ul className="entry-list">{rows}</ul>
              </li>
            )
          })}
        </ul>
      </DndContext>
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
