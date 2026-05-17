interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export function SyncConfirmModal({ open, onClose, onConfirm }: Props) {
  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>イベント同期の確認</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '15px', lineHeight: '1.6' }}>
            表示期間内の全てのイベント情報をGoogleカレンダーと同期します。
          </p>
          <div style={{ padding: '12px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', marginBottom: '15px' }}>
            <p style={{ margin: 0, color: '#856404', fontSize: '0.9rem', lineHeight: '1.5' }}>
              <strong>⚠️ 注意:</strong> イベント数が多い場合、処理に時間がかかることがあります。
            </p>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: '1.5' }}>
            同期を実行しますか？
          </p>
        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="form-btn secondary" onClick={onClose}>キャンセル</button>
          <button type="button" className="form-btn primary" onClick={onConfirm}>同期</button>
        </div>
      </div>
    </div>
  )
}
