import { useEffect, useRef, useId } from 'react'
import type { ReactNode, PointerEvent, MouseEvent } from 'react'
interface Props { title: string; onClose: () => void; children: ReactNode; busy?: boolean; closeLabel?: string }
export function BoardDialog({ title, onClose, children, busy = false, closeLabel = '閉じる' }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    dialog.setAttribute('closedby', 'any')
    dialog.showModal()
    return () => dialog.close()
  }, [])
  useEffect(() => { ref.current?.setAttribute('closedby', busy ? 'none' : 'any') }, [busy])
  useEffect(() => {
    const dialog = ref.current!
    const revealComment = () => {
      const active = document.activeElement
      if (!(active instanceof HTMLTextAreaElement) || !active.closest('.board-comment-input')) return
      if (!window.matchMedia('(pointer: coarse)').matches) return
      requestAnimationFrame(() => {
        if (document.activeElement !== active) return
        const body = active.closest<HTMLElement>('.board-dialog-body')
        if (!body) return
        const field = active.getBoundingClientRect()
        const bounds = body.getBoundingClientRect()
        const viewport = window.visualViewport
        const visibleTop = Math.max(bounds.top, viewport?.offsetTop ?? 0) + 8
        const visibleBottom = Math.min(bounds.bottom, viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 8
        if (visibleBottom <= visibleTop) return
        if (field.bottom > visibleBottom) body.scrollTop += field.bottom - visibleBottom
        else if (field.top < visibleTop) body.scrollTop -= visibleTop - field.top
      })
    }
    dialog.addEventListener('focusin', revealComment)
    window.visualViewport?.addEventListener('resize', revealComment)
    return () => {
      dialog.removeEventListener('focusin', revealComment)
      window.visualViewport?.removeEventListener('resize', revealComment)
    }
  }, [])
  const outsideStart = useRef(false)
  const outside = (event: PointerEvent | MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    return event.target === ref.current && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
  }
  return <dialog className="board-dialog" ref={ref} aria-labelledby={titleId}
    onCancel={event => { if (busy) event.preventDefault() }} onClose={() => { if (!ref.current?.open) onClose() }}
    onPointerDown={event => { outsideStart.current = outside(event) }}
    onClick={event => { if (!('closedBy' in HTMLDialogElement.prototype) && outsideStart.current && outside(event) && !busy) ref.current?.close() }}>
    <div className="board-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" onClick={onClose} disabled={busy} autoFocus>{closeLabel}</button></div>
    {children}
  </dialog>
}
