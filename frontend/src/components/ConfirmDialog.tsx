interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  isDestructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  isDestructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="scanner-overlay" role="dialog" aria-label={title} aria-modal="true">
      <div className="scanner-frame">
        <h2 className="card__title">{title}</h2>
        <p>{message}</p>
        <div className="form__actions" style={{ marginTop: 'var(--space-lg)' }}>
          <button type="button" className={isDestructive ? 'btn btn--danger' : 'btn btn--primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
