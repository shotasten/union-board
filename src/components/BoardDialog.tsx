import { useEffect, useRef, useId } from 'react'
import type { ReactNode, PointerEvent, MouseEvent } from 'react'
interface Props { title: string; onClose: () => void; children: ReactNode; busy?: boolean }
export function BoardDialog({ title, onClose, children, busy = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    dialog.setAttribute('closedby', 'any')
    dialog.showModal()
    return () => dialog.close()
  }, [])
  useEffect(() => { ref.current?.setAttribute('closedby', busy ? 'none' : 'any') }, [busy])
  const outsideStart = useRef(false)
  const outside = (event: PointerEvent | MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    return event.target === ref.current && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
  }
  return <dialog className="board-dialog" ref={ref} aria-labelledby={titleId}
    onCancel={event => { if (busy) event.preventDefault() }} onClose={() => { if (!ref.current?.open) onClose() }}
    onPointerDown={event => { outsideStart.current = outside(event) }}
    onClick={event => { if (!('closedBy' in HTMLDialogElement.prototype) && outsideStart.current && outside(event) && !busy) ref.current?.close() }}>
    <div className="board-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" onClick={onClose} disabled={busy} autoFocus>閉じる</button></div>
    {children}
  </dialog>
}
