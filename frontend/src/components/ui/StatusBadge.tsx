const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  DRAFT:      { label: 'Draft',      dot: 'bg-charcoal-300', text: 'text-charcoal-500' },
  GENERATING: { label: 'Generating', dot: 'bg-amber',        text: 'text-amber' },
  GENERATED:  { label: 'Generated',  dot: 'bg-cyan',         text: 'text-charcoal-600' },
  PUBLISHING: { label: 'Publishing', dot: 'bg-brand',        text: 'text-brand' },
  ACTIVE:     { label: 'Active',     dot: 'bg-brand',        text: 'text-brand' },
  COMPLETE:   { label: 'Complete',   dot: 'bg-success',      text: 'text-success' },
  FAILED:     { label: 'Error',      dot: 'bg-danger',       text: 'text-danger' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}
