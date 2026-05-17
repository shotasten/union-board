interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export function LogoutConfirmModal({ open, onClose, onConfirm }: Props) {
  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>管理者ログアウトの確認</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '15px', lineHeight: '1.6' }}>管理者としてログアウトしますか？</p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: '1.5' }}>
            ログアウト後は、管理者機能（イベント登録・編集・削除など）が使用できなくなります。
          </p>
        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="form-btn secondary" onClick={onClose}>キャンセル</button>
          <button type="button" className="form-btn primary" onClick={onConfirm}>ログアウト</button>
        </div>
      </div>
    </div>
  )
}
