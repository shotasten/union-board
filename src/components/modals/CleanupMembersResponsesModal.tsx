interface Props {
  open: boolean
  onClose: () => void
  onNext: () => void
}

export function CleanupMembersResponsesModal({ open, onClose, onNext }: Props) {
  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>メンバーと出欠回答の削除</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '15px', lineHeight: '1.6' }}>
            新年度を迎える際に、メンバーと出欠回答データを削除する機能です。
          </p>
          <div style={{ padding: '12px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', marginBottom: '15px' }}>
            <p style={{ margin: 0, color: '#856404', fontSize: '0.9rem', lineHeight: '1.5' }}>
              <strong>削除対象:</strong><br />
              • Membersテーブルの全データ<br />
              • Responsesテーブルの全データ
            </p>
          </div>
          <div style={{ padding: '12px', backgroundColor: '#e3f2fd', border: '1px solid #2196f3', borderRadius: '6px', marginBottom: '15px' }}>
            <p style={{ margin: 0, color: '#1565c0', fontSize: '0.9rem', lineHeight: '1.5' }}>
              <strong>注意:</strong><br />
              • イベントデータは削除されません<br />
              • 次回出欠登録時にメンバーは自動再登録されます<br />
              • この操作は取り消せません
            </p>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: '1.5' }}>
            メンバーと出欠回答の削除を実行しますか？
          </p>
        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="form-btn secondary" onClick={onClose}>キャンセル</button>
          <button type="button" className="form-btn danger" onClick={onNext}>削除</button>
        </div>
      </div>
    </div>
  )
}
