import * as React from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'outline'

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-slate-900 text-white',
  secondary: 'border-transparent bg-slate-100 text-slate-900',
  outline: 'border border-slate-300 text-slate-900',
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
