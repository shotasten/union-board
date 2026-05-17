import type { ToastState } from '../hooks/useAppState'

interface Props {
  toast: ToastState
}

export function Toast({ toast }: Props) {
  return (
    <div className={`toast ${toast.type}`}>
      {toast.message}
    </div>
  )
}
