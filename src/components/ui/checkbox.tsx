import * as React from 'react'
import { cn } from '@/lib/utils'

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      className={cn(
        'h-4 w-4 rounded border-slate-300 text-slate-900 accent-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
        className,
      )}
      {...props}
    />
  ),
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
