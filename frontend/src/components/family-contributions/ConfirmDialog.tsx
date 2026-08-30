type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  variant?: "destructive" | "primary"
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Delete", variant = "destructive", onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null
  const confirmClass = variant === "primary"
    ? "rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
    : "rounded-lg bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90"
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className={confirmClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
