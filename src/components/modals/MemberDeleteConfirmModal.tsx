import { useState } from 'react'

interface Props {
  open: boolean
  memberKey: string | null
  memberName: string
  onClose: () => void
  onConfirm: (memberKey: string) => Promise<boolean>
}

export function MemberDeleteConfirmModal({ open, memberKey, memberName, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false)

  if (!open || !memberKey) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleConfirm = async () => {
    if (!memberKey) return
    setLoading(true)
    await onConfirm(memberKey)
    setLoading(false)
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>メンバー削除の確認</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '15px', lineHeight: '1.6' }}>
            <strong>{memberName}</strong> を削除しますか？
          </p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: '1.5' }}>
            このメンバーの全ての出欠データも削除されます。この操作は取り消せません。
          </p>
        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="form-btn secondary" onClick={onClose} disabled={loading}>キャンセル</button>
          <button
            type="button"
            className="form-btn danger confirm-delete-member-btn"
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
