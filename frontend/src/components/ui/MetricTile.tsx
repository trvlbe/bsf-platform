interface Props {
  label: string
  value: number | string
  unit?: string
  delta?: string
  brand?: boolean
}

export function MetricTile({ label, value, unit, delta, brand }: Props) {
  const isUp = delta?.startsWith('+')
  return (
    <div className={`flex-1 min-w-[160px] p-5 rounded-md border ${brand ? 'border-charcoal-900 bg-white' : 'border-charcoal-100 bg-white'} shadow-sm`}>
      <div className="font-display text-xs tracking-widest uppercase text-charcoal-400 mb-2">{label}</div>
      <div className="font-display font-semibold text-4xl text-charcoal-900">
        {value}{unit && <span className="text-2xl text-charcoal-400 ml-0.5">{unit}</span>}
      </div>
      {delta && (
        <div className={`text-xs font-medium mt-1 ${isUp ? 'text-success' : 'text-danger'}`}>{delta}</div>
      )}
    </div>
  )
}
