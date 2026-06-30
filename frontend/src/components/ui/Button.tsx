import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

const VARIANT = {
  primary:   'bg-brand text-white shadow-brand hover:bg-brand-600',
  secondary: 'bg-charcoal-900 text-white hover:bg-charcoal-800',
  ghost:     'bg-transparent text-charcoal-900 border border-charcoal-200 hover:border-charcoal-900 hover:bg-charcoal-050',
}
const SIZE = {
  sm: 'py-2 px-3.5 text-xs',
  md: 'py-3 px-5 text-sm',
  lg: 'py-4 px-7 text-sm',
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: Props) {
  return (
    <button
      className={`inline-flex items-center gap-2 font-display font-semibold tracking-[.14em] uppercase rounded cursor-pointer transition-all duration-[120ms] disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
