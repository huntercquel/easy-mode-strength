import * as React from 'react'
import { cn } from '@/lib/utils'
import { getNextTabValue, getTabPanelId, getTabTriggerId } from '@/components/ui/tabs-helpers'

type TabsContextValue = {
  baseId: string
  value: string
  onValueChange: (value: string) => void
  registerValue: (value: string) => void
  unregisterValue: (value: string) => void
  values: string[]
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
  const baseId = React.useId()
  const [values, setValues] = React.useState<string[]>([])

  const registerValue = React.useCallback((nextValue: string) => {
    setValues((currentValues) => (currentValues.includes(nextValue) ? currentValues : [...currentValues, nextValue]))
  }, [])

  const unregisterValue = React.useCallback((nextValue: string) => {
    setValues((currentValues) => currentValues.filter((value) => value !== nextValue))
  }, [])

  return (
    <TabsContext.Provider value={{ baseId, value, onValueChange, registerValue, unregisterValue, values }}>
      <div className={cn(className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn('inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1', className)}
      {...props}
    />
  ),
)
TabsList.displayName = 'TabsList'

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, onClick, onKeyDown, type = 'button', ...props }, ref) => {
    const { baseId, onValueChange, registerValue, unregisterValue, value: activeValue, values } = useTabsContext()
    const isActive = activeValue === value
    const triggerId = getTabTriggerId(baseId, value)
    const panelId = getTabPanelId(baseId, value)

    React.useEffect(() => {
      registerValue(value)
      return () => unregisterValue(value)
    }, [registerValue, unregisterValue, value])

    return (
      <button
        ref={ref}
        id={triggerId}
        type={type}
        role="tab"
        aria-selected={isActive}
        aria-controls={panelId}
        tabIndex={isActive ? 0 : -1}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
          isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          className,
        )}
        onClick={(event) => {
          onValueChange(value)
          onClick?.(event)
        }}
        onKeyDown={(event) => {
          const nextValue = getNextTabValue(values, value, event.key)
          if (nextValue !== value) {
            event.preventDefault()
            onValueChange(nextValue)
            const nextTrigger = document.getElementById(getTabTriggerId(baseId, nextValue))
            nextTrigger?.focus()
          }

          onKeyDown?.(event)
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

  return (
    <div
      ref={ref}
      id={getTabPanelId(context.baseId, value)}
      role="tabpanel"
      aria-labelledby={getTabTriggerId(context.baseId, value)}
      tabIndex={0}
      className={cn(className)}
      {...props}
    />
  )
})
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsContent, TabsList, TabsTrigger }
