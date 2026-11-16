import { useEffect, useRef } from 'react'
import type { TouchEvent } from 'react'
import type { ToastState } from '../hooks/useAppState'

interface Props {
  toast: ToastState
  onDismiss: () => void
}

export function Toast({ toast, onDismiss }: Props) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    const timer = window.setTimeout(() => dismissRef.current(), toast.duration ?? 3000)
    return () => window.clearTimeout(timer)
  }, [toast.duration])

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current
    touchStart.current = null
    const end = event.changedTouches[0]
    if (start && end && start.y - end.clientY > 40 && start.y - end.clientY > Math.abs(start.x - end.clientX)) {
      onDismiss()
    }
  }

  return (
    <div className={`toast app-toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}
      onTouchStart={event => { const touch = event.touches[0]; touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null }}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStart.current = null }}>
      <span>{toast.message}</span>
    </div>
  )
}
