interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<boolean>
}

export function CleanupMembersResponsesFinalConfirmModal({ open, onClose, onConfirm }: Props) {
  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>最終確認</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '15px', lineHeight: '1.6', fontSize: '1.1rem', fontWeight: 'bold', color: '#d32f2f' }}>
            ⚠️ 本当に削除しますか？
          </p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: '1.5', fontWeight: 'bold' }}>
            この操作は取り消せません。メンバーと出欠回答データを削除します。
          </p>
        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="form-btn secondary" onClick={onClose}>キャンセル</button>
          <button
            type="button"
            className="form-btn danger confirm-cleanup-members-responses-btn"
            onClick={onConfirm}
          >
            削除
          </button>
        </div>
      </div>
    </div>
  )
}
