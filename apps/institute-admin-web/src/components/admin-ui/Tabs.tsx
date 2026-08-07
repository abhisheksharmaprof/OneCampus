import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface TabItem {
  id: string
  label: ReactNode
  panel: ReactNode
  href?: string
  disabled?: boolean
}

export interface TabsProps {
  tabs: readonly TabItem[]
  activeId: string
  onChange?: (id: string) => void
  label: string
}

export function Tabs({ tabs, activeId, onChange, label }: TabsProps) {
  const instanceId = useId()
  const tabRefs = useRef(new Map<string, HTMLElement>())
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs.find((tab) => !tab.disabled)

  useEffect(() => {
    const activeElement = activeTab ? tabRefs.current.get(activeTab.id) : undefined
    const tabList = activeElement?.parentElement
    if (!activeElement || !tabList) return
    const itemLeft = activeElement.offsetLeft
    const itemRight = itemLeft + activeElement.offsetWidth
    const viewportLeft = tabList.scrollLeft
    const viewportRight = viewportLeft + tabList.clientWidth
    const nextLeft = itemLeft < viewportLeft
      ? itemLeft - 5
      : itemRight > viewportRight
        ? itemRight - tabList.clientWidth + 5
        : viewportLeft
    tabList.scrollTo?.({ left: Math.max(0, nextLeft), behavior: 'smooth' })
  }, [activeTab])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, currentIndex: number) => {
    const enabled = tabs.map((tab, index) => ({ tab, index })).filter(({ tab }) => !tab.disabled)
    const position = enabled.findIndex(({ index }) => index === currentIndex)
    let nextPosition: number | undefined
    if (event.key === 'ArrowRight') nextPosition = (position + 1) % enabled.length
    if (event.key === 'ArrowLeft') nextPosition = (position - 1 + enabled.length) % enabled.length
    if (event.key === 'Home') nextPosition = 0
    if (event.key === 'End') nextPosition = enabled.length - 1
    if (nextPosition === undefined) return
    event.preventDefault()
    const next = enabled[nextPosition].tab
    tabRefs.current.get(next.id)?.focus()
    onChange?.(next.id)
  }

  return (
    <div className="admin-tabs">
      <div className="admin-tabs__list" role="tablist" aria-label={label}>
        {tabs.map((tab, index) => {
          const selected = tab.id === activeTab?.id
          const commonProps = {
            id: `${instanceId}-tab-${tab.id}`,
            role: 'tab',
            'aria-selected': selected,
            'aria-controls': `${instanceId}-panel-${tab.id}`,
            tabIndex: selected ? 0 : -1,
            onKeyDown: (event: KeyboardEvent<HTMLElement>) => handleKeyDown(event, index),
            ref: (element: HTMLElement | null) => { if (element) tabRefs.current.set(tab.id, element); else tabRefs.current.delete(tab.id) },
          }
          return tab.href && !tab.disabled
            ? <a {...commonProps} href={tab.href} key={tab.id} onClick={() => onChange?.(tab.id)}>{tab.label}</a>
            : <button {...commonProps} type="button" key={tab.id} disabled={tab.disabled} onClick={() => onChange?.(tab.id)}>{tab.label}</button>
        })}
      </div>
      {activeTab ? <div className="admin-tabs__panel" id={`${instanceId}-panel-${activeTab.id}`} role="tabpanel" aria-labelledby={`${instanceId}-tab-${activeTab.id}`} tabIndex={0}>{activeTab.panel}</div> : null}
    </div>
  )
}
