import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<boolean>
}

export function ClearDisplayPeriodConfirmModal({ open, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleConfirm = async () => {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>表示期間の制限解除</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '15px', lineHeight: '1.6' }}>
            表示期間の制限を解除しますか？
          </p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: '1.5' }}>
            全期間のイベントが表示されるようになります。
          </p>
        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="form-btn secondary" onClick={onClose} disabled={loading}>キャンセル</button>
          <button
            type="button"
            className="form-btn danger confirm-clear-period-btn"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? '解除中...' : '解除'}
          </button>
        </div>
      </div>
    </div>
  )
}
