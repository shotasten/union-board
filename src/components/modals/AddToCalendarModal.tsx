import type { Config } from '../../types/models'

interface Props {
  open: boolean
  config: Config | null
  onClose: () => void
}

export function AddToCalendarModal({ open, config, onClose }: Props) {
  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const c = config as unknown as Record<string, string> | null
  const calendarId = c?.['CALENDAR_ID'] || ''
  const calendarUrl = calendarId
    ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(calendarId)}`
    : '#'

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>📅 自分のGoogleカレンダーに追加</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
            <p style={{ margin: '0 0 10px 0', lineHeight: '1.6' }}>
              このボタンをクリックすると、<strong>楽団のイベントカレンダー</strong>があなたのGoogleカレンダーに追加されます。
            </p>
            <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.8', color: '#666' }}>
              <li>イベントは自動的に同期され、常に最新の情報が表示されます</li>
              <li>あなたの「他のカレンダー」セクションに表示されます</li>
              <li>閲覧のみ可能です（編集は本アプリから行ってください）</li>
            </ul>
          </div>
          {calendarId ? (
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <a
                id="calendar-add-link"
                href={calendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', padding: '14px 28px', background: '#667eea', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: 500, fontSize: '1rem' }}
              >
                📅 Googleカレンダーに追加
              </a>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#f44336', margin: '20px 0' }}>
              カレンダーIDが設定されていません。管理者に連絡してください。
            </div>
          )}
          <div style={{ marginTop: '20px', padding: '12px', background: '#fff3cd', borderRadius: '6px' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#856404', lineHeight: '1.5' }}>
              <strong>ℹ️ ヒント:</strong> カレンダーを削除したい場合は、Googleカレンダーの設定から「Tokyo Music Union イベントカレンダー」の購読を解除してください。
            </p>
          </div>
        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="form-btn secondary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  )
}
