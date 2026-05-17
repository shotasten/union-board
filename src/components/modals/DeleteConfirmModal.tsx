import { useState } from 'react'

interface Props {
  open: boolean
  eventId: string | null
  eventTitle: string
  onClose: () => void
  onConfirm: (eventId: string) => Promise<boolean>
}

export function DeleteConfirmModal({ open, eventId, eventTitle, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false)

  if (!open || !eventId) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleConfirm = async () => {
    if (!eventId) return
    setLoading(true)
    await onConfirm(eventId)
    setLoading(false)
  }

  return (
    <div className="confirm-dialog" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="confirm-dialog-content">
        <h3>イベントを削除しますか？</h3>
        <p>「{eventTitle}」を削除しますか？この操作は取り消せません。</p>
        <div className="confirm-dialog-actions">
          <button className="confirm-btn cancel" onClick={onClose} disabled={loading}>キャンセル</button>
          <button
            className="confirm-btn danger"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? '削除中...' : '削除'}
          </button>
        </div>
      </div>
    </div>
  )
}
