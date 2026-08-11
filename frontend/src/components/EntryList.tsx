import type { ReactNode } from 'react'
import { useState } from 'react'

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'

import { ApiError } from '../api/client'
import { createEntry, createMealGroup } from '../api/endpoints'
import type { CreateFoodEntryPayload, FoodEntry, MealGroup } from '../api/types'
import {
  combineDateAndTime,
  displayTime,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  toISODate,
  toISOTime,
} from '../lib/dates'
import { unitLabel } from '../lib/units'
import ConfirmDialog from './ConfirmDialog'

export interface EntryEditValues {
  consumedAt: string
  grams: number
  inputAmount: number
}

interface EntryListProps {
  entries: FoodEntry[]
  onDelete: (entry: FoodEntry) => void
  deletingId?: string | null
  emptyMessage?: string
  groups?: MealGroup[]
  onMoveEntry?: (entry: FoodEntry, targetGroupId: string) => void
  onRenameGroup?: (groupId: string, name: string) => void
  onUngroup?: (groupId: string) => void
  // Covers both a retroactive time correction and a retroactive portion correction - whichever
  // fields the edit row actually changed, `grams` is always recomputed from `inputAmount` in the
  // entry's original unit so the two never drift apart.
  onUpdateEntry?: (entry: FoodEntry, updates: EntryEditValues) => void
  // Called after a past entry (or a whole meal group) is successfully re-logged for today - via
  // "Repeat today", "Repeat with changes", or a meal group's "Repeat meal today". Lets the page
  // refresh its own data when that affects what's currently on screen (i.e. it's already viewing
  // today - a repeat always lands on today's log regardless of which day's entries are being
  // browsed). Omitting this hides all three repeat actions: Dashboard's "Logged today" list only
  // ever shows today, so there's nothing in it to repeat from.
  onEntryRepeated?: () => void | Promise<void>
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
  editAmount: string
  onEditAmountChange: (value: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  deletingId?: string | null
  showEdit: boolean
  showRepeat: boolean
  // Which entry (if any) currently has its "Repeat with changes" form open - null/undefined for
  // every row except the one being adjusted.
  customRepeatId?: string | null
  repeatAmount: string
  onRepeatAmountChange: (value: string) => void
  onStartCustomRepeat: () => void
  onQuickRepeat: () => void
  onSaveCustomRepeat: () => void
  onCancelCustomRepeat: () => void
  // Which entry (if any) has a repeat request in flight - covers both the quick and the
  // amount-adjusted path, since only one can ever be running for a given row at a time.
  repeatingId?: string | null
  // Which entry (if any) just finished repeating successfully, for the brief "Repeated ✓"
  // confirmation - the only feedback a repeat gets when it lands on a day other than the one
  // currently being viewed.
  justRepeatedId?: string | null
}

// Every row is both a drag source (id = the entry) and a drop target (id = the entry's current
// group) - dropping one entry onto any row belonging to a group merges it into that same group,
// so a multi-item box needs no separate box-level drop target of its own.
function EntryRow({
  entry,
  isEditing,
  editDatetime,
  onEditDatetimeChange,
  editAmount,
  onEditAmountChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  deletingId,
  showEdit,
  showRepeat,
  customRepeatId,
  repeatAmount,
  onRepeatAmountChange,
  onStartCustomRepeat,
  onQuickRepeat,
  onSaveCustomRepeat,
  onCancelCustomRepeat,
  repeatingId,
  justRepeatedId,
}: EntryRowProps) {
  const isCustomRepeating = customRepeatId === entry.id
  const isRepeatBusy = repeatingId === entry.id
  const isJustRepeated = justRepeatedId === entry.id
  const draggable = useDraggable({ id: entry.id, disabled: isEditing || isCustomRepeating })
  const droppable = useDroppable({ id: entry.meal_group_id ?? entry.id })

  function setRefs(node: HTMLLIElement | null) {
    draggable.setNodeRef(node)
    droppable.setNodeRef(node)
  }

  const style = draggable.transform
    ? { transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)` }
    : undefined

  if (isEditing) {
    const canSave = editAmount !== '' && Number(editAmount) > 0
    return (
      <li key={entry.id} className="entry-row entry-row--editing" ref={setRefs} style={style}>
        {nameAndMeta(entry)}
        {/* A real form, not a bare onClick, so the amount<=0 guard in onSaveEdit is reachable the
            same way Log Food's amount guard is - by submitting past the disabled Save button /
            native min validation, not just by disabling it. display:contents keeps its two
            children (the fields, the actions) as direct flex items of .entry-row--editing,
            unchanged from the non-form layout. */}
        <form
          style={{ display: 'contents' }}
          onSubmit={(event) => {
            event.preventDefault()
            onSaveEdit()
          }}
        >
          <div className="form__row">
            <div className="field">
              <label htmlFor={`edit-amount-${entry.id}`}>{unitLabel(entry.input_unit)}</label>
              <input
                id={`edit-amount-${entry.id}`}
                className="input"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="any"
                value={editAmount}
                onChange={(event) => onEditAmountChange(event.target.value)}
              />
            </div>
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
          </div>
          <div className="entry-row__actions">
            <button
              type="submit"
              className="btn btn--primary btn--small"
              disabled={!canSave}
              title={canSave ? undefined : 'Enter an amount greater than 0'}
            >
              Save
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={onCancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    )
  }

  if (isCustomRepeating) {
    const canSave = repeatAmount !== '' && Number(repeatAmount) > 0
    return (
      <li key={entry.id} className="entry-row entry-row--editing" ref={setRefs} style={style}>
        {nameAndMeta(entry)}
        {/* Same guarded-form shape as the retroactive edit above, but this one creates a brand new
            entry dated today instead of touching this one - `entry` here only supplies the food
            and its original amount as a starting point. */}
        <form
          style={{ display: 'contents' }}
          onSubmit={(event) => {
            event.preventDefault()
            onSaveCustomRepeat()
          }}
        >
          <div className="form__row">
            <div className="field">
              <label htmlFor={`repeat-amount-${entry.id}`}>{unitLabel(entry.input_unit)}</label>
              <input
                id={`repeat-amount-${entry.id}`}
                className="input"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="any"
                autoFocus
                value={repeatAmount}
                onChange={(event) => onRepeatAmountChange(event.target.value)}
              />
            </div>
          </div>
          <div className="entry-row__actions">
            <button
              type="submit"
              className="btn btn--primary btn--small"
              disabled={!canSave || isRepeatBusy}
              title={canSave ? undefined : 'Enter an amount greater than 0'}
            >
              {isRepeatBusy && <span className="btn__spinner" aria-hidden="true" />}
              Add to today
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={onCancelCustomRepeat}>
              Cancel
            </button>
          </div>
        </form>
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
        {showRepeat && (
          <>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={onQuickRepeat}
              disabled={isRepeatBusy}
              aria-label={`Repeat ${entry.name} today`}
            >
              {isRepeatBusy ? (
                <span className="btn__spinner" aria-hidden="true" />
              ) : isJustRepeated ? (
                'Repeated ✓'
              ) : (
                'Repeat today'
              )}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={onStartCustomRepeat}
              disabled={isRepeatBusy}
              aria-label={`Repeat ${entry.name} today with a different amount`}
            >
              Repeat with changes
            </button>
          </>
        )}
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
  onUpdateEntry,
  onEntryRepeated,
}: EntryListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDatetime, setEditDatetime] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<FoodEntry | null>(null)

  // Which entry (if any) has its "Repeat with changes" amount form open, what's currently typed
  // into it, which entry (if any) has a repeat request in flight, which just finished, and the
  // error from the most recent failed attempt - all scoped to the repeat actions specifically, the
  // same way editingId/editAmount above are scoped to the retroactive-edit action.
  const [customRepeatId, setCustomRepeatId] = useState<string | null>(null)
  const [repeatAmount, setRepeatAmount] = useState('')
  const [repeatingId, setRepeatingId] = useState<string | null>(null)
  const [justRepeatedId, setJustRepeatedId] = useState<string | null>(null)
  const [repeatError, setRepeatError] = useState<string | null>(null)

  // Same shape, one level up: which meal group (if any) is being repeated as a whole, and which
  // just finished. Shares repeatError above rather than a group-scoped error of its own.
  const [repeatingGroupId, setRepeatingGroupId] = useState<string | null>(null)
  const [justRepeatedGroupId, setJustRepeatedGroupId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  if (entries.length === 0) {
    return <div className="empty-state">{emptyMessage ?? 'Nothing logged yet.'}</div>
  }

  function startEditing(entry: FoodEntry) {
    setEditingId(entry.id)
    setEditDatetime(toDatetimeLocalValue(entry.consumed_at))
    setEditAmount(String(entry.input_amount))
    // Only one inline form is open across the whole list at a time, the same way only one group
    // can be mid-rename at a time - starting an edit drops any repeat-with-changes form open on a
    // different row.
    setCustomRepeatId(null)
  }

  function handleEditAmountChange(raw: string) {
    if (raw === '') {
      setEditAmount('')
      return
    }
    // Strip a stuck leading zero, same as the amount field on the Log Food form.
    setEditAmount(raw.replace(/^0+(?=\d)/, ''))
  }

  function saveEdit(entry: FoodEntry) {
    const amount = editAmount === '' ? 0 : Number(editAmount)
    if (amount <= 0) return
    const grams = entry.input_unit === 'g' ? amount : amount * entry.unit_to_grams
    onUpdateEntry?.(entry, { consumedAt: fromDatetimeLocalValue(editDatetime), grams, inputAmount: amount })
    setEditingId(null)
  }

  function startCustomRepeat(entry: FoodEntry) {
    setCustomRepeatId(entry.id)
    setRepeatAmount(String(entry.input_amount))
    setRepeatError(null)
    // Same mutual-exclusion as startEditing, the other way around.
    setEditingId(null)
  }

  function handleRepeatAmountChange(raw: string) {
    if (raw === '') {
      setRepeatAmount('')
      return
    }
    setRepeatAmount(raw.replace(/^0+(?=\d)/, ''))
  }

  // Builds the payload for a brand new entry carrying over everything about `entry`'s food except
  // the amount (callers pass that explicitly) and the time - it's always dated to *today*, the
  // real calendar day, not whichever day's entries are currently on screen.
  function repeatPayload(entry: FoodEntry, inputAmount: number): CreateFoodEntryPayload {
    const grams = entry.input_unit === 'g' ? inputAmount : inputAmount * entry.unit_to_grams
    return {
      name: entry.name,
      brand: entry.brand,
      barcode: entry.barcode,
      grams,
      input_unit: entry.input_unit,
      input_amount: inputAmount,
      unit_to_grams: entry.unit_to_grams,
      calories_per_100g: entry.calories_per_100g,
      protein_per_100g: entry.protein_per_100g,
      carbs_per_100g: entry.carbs_per_100g,
      fat_per_100g: entry.fat_per_100g,
      consumed_at: combineDateAndTime(toISODate(new Date()), toISOTime(new Date())),
    }
  }

  async function repeatEntry(entry: FoodEntry, inputAmount: number) {
    setRepeatingId(entry.id)
    setRepeatError(null)
    try {
      await createEntry(repeatPayload(entry, inputAmount))
      setCustomRepeatId(null)
      setJustRepeatedId(entry.id)
      setTimeout(() => setJustRepeatedId(null), 1500)
      await onEntryRepeated?.()
    } catch (error) {
      setRepeatError(error instanceof ApiError ? error.message : `Could not repeat "${entry.name}".`)
    } finally {
      setRepeatingId(null)
    }
  }

  function saveCustomRepeat(entry: FoodEntry) {
    const amount = repeatAmount === '' ? 0 : Number(repeatAmount)
    if (amount <= 0) return
    repeatEntry(entry, amount)
  }

  // Repeats every entry in a meal group at once, then re-groups the newly created entries under
  // the same name (if any) - each create lands in its own fresh singleton group same as a lone
  // repeat, so without this last step the meal would come back apart instead of together.
  async function repeatGroup(cluster: Cluster) {
    // Only ever called from the "Repeat meal today" button, which is rendered exclusively inside
    // the cluster.groupId !== null branch below - so this is always a real group.
    const groupId = cluster.groupId!
    setRepeatingGroupId(groupId)
    setRepeatError(null)
    try {
      const created = await Promise.all(
        cluster.entries.map((entry) => createEntry(repeatPayload(entry, entry.input_amount)))
      )
      const groupName = groups?.find((candidate) => candidate.id === groupId)?.name ?? null
      await createMealGroup(
        created.map((entry) => entry.id),
        groupName
      )
      setJustRepeatedGroupId(groupId)
      setTimeout(() => setJustRepeatedGroupId(null), 1500)
      await onEntryRepeated?.()
    } catch (error) {
      setRepeatError(error instanceof ApiError ? error.message : 'Could not repeat this meal.')
    } finally {
      setRepeatingGroupId(null)
    }
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
      {repeatError && <div className="form__banner">{repeatError}</div>}
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
                editAmount={editAmount}
                onEditAmountChange={handleEditAmountChange}
                onStartEdit={() => startEditing(entry)}
                onSaveEdit={() => saveEdit(entry)}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => setPendingDelete(entry)}
                deletingId={deletingId}
                showEdit={Boolean(onUpdateEntry)}
                showRepeat={Boolean(onEntryRepeated)}
                customRepeatId={customRepeatId}
                repeatAmount={repeatAmount}
                onRepeatAmountChange={handleRepeatAmountChange}
                onStartCustomRepeat={() => startCustomRepeat(entry)}
                onQuickRepeat={() => repeatEntry(entry, entry.input_amount)}
                onSaveCustomRepeat={() => saveCustomRepeat(entry)}
                onCancelCustomRepeat={() => setCustomRepeatId(null)}
                repeatingId={repeatingId}
                justRepeatedId={justRepeatedId}
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
                  <div className="meal-group__header-actions">
                    {/* A lone boxed entry already has its own row-level repeat actions - this one's
                        only useful once there's more than one item to keep together. */}
                    {Boolean(onEntryRepeated) && cluster.entries.length > 1 && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => repeatGroup(cluster)}
                        disabled={repeatingGroupId === groupId}
                        aria-label={`Repeat this meal today${group?.name ? `: ${group.name}` : ''}`}
                      >
                        {repeatingGroupId === groupId ? (
                          <span className="btn__spinner" aria-hidden="true" />
                        ) : justRepeatedGroupId === groupId ? (
                          'Repeated ✓'
                        ) : (
                          'Repeat meal today'
                        )}
                      </button>
                    )}
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => onUngroup?.(groupId)}>
                      Ungroup
                    </button>
                  </div>
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
