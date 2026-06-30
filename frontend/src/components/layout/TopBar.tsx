interface Props {
  eyebrow?: string
  title: string
  action?: React.ReactNode
}

export function TopBar({ eyebrow, title, action }: Props) {
  return (
    <header className="flex items-center justify-between px-8 py-5 border-b border-charcoal-100 bg-white sticky top-0 z-10">
      <div>
        {eyebrow && <div className="font-display text-xs tracking-widest uppercase text-charcoal-400 mb-1">{eyebrow}</div>}
        <h1 className="font-display font-medium text-2xl uppercase text-charcoal-900 tracking-tight">{title}</h1>
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </header>
  )
}
