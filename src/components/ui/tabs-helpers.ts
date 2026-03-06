export function getTabTriggerId(baseId: string, value: string) {
  return `${baseId}-trigger-${value}`
}

export function getTabPanelId(baseId: string, value: string) {
  return `${baseId}-panel-${value}`
}

export function getNextTabValue(values: string[], currentValue: string, key: string): string {
  if (values.length === 0) {
    return currentValue
  }

  const currentIndex = Math.max(0, values.indexOf(currentValue))

  if (key === 'Home') {
    return values[0] ?? currentValue
  }

  if (key === 'End') {
    return values[values.length - 1] ?? currentValue
  }

  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    const nextIndex = (currentIndex - 1 + values.length) % values.length
    return values[nextIndex] ?? currentValue
  }

  if (key === 'ArrowRight' || key === 'ArrowDown') {
    const nextIndex = (currentIndex + 1) % values.length
    return values[nextIndex] ?? currentValue
  }

  return currentValue
}
