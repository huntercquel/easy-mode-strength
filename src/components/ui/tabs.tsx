import * as React from 'react'
import { cn } from '@/lib/utils'

type TabsContextValue = {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within <Tabs>')
  }
  return context
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  onValueChange: (value: string) => void
}

function Tabs({ value, onValueChange, className, children, ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn(className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1', className)} {...props} />
  ),
)
TabsList.displayName = 'TabsList'

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, onClick, type = 'button', ...props }, ref) => {
    const context = useTabsContext()
    const isActive = context.value === value

    return (
      <button
        ref={ref}
        type={type}
        role="tab"
        aria-selected={isActive}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
          isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          className,
        )}
        onClick={(event) => {
          context.onValueChange(value)
          onClick?.(event)
        }}
        {...props}
      />
    )
  },
)
TabsTrigger.displayName = 'TabsTrigger'

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(({ className, value, ...props }, ref) => {
  const context = useTabsContext()

  if (context.value !== value) {
    return null
  }

  return <div ref={ref} role="tabpanel" className={cn(className)} {...props} />
})
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsContent, TabsList, TabsTrigger }
