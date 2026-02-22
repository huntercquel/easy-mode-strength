import * as React from 'react'
import { cn } from '@/lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

function Progress({ className, value = 0, ...props }: ProgressProps) {
  const clampedValue = Math.max(0, Math.min(100, value))

  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-slate-200', className)} {...props}>
      <div className="h-full bg-slate-900 transition-all" style={{ width: `${clampedValue}%` }} />
    </div>
  )
}

export { Progress }
