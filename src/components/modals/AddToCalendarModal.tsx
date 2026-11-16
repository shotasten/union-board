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
      <div className="modal-content calendar-modal-content" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h2>自分のGoogleカレンダーに追加</h2>
          <button type="button" className="close-btn" aria-label="閉じる" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="calendar-info">
            <p style={{ margin: '0 0 10px 0', lineHeight: '1.6' }}>
              このボタンをクリックすると、<strong>楽団のイベントカレンダー</strong>があなたのGoogleカレンダーに追加されます。
            </p>
            <ul>
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
                className="calendar-add-link"
              >
                Googleカレンダーに追加
              </a>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#f44336', margin: '20px 0' }}>
              カレンダーIDが設定されていません。管理者に連絡してください。
            </div>
          )}
          <div className="calendar-hint">
            <p>
              <strong>ヒント:</strong> カレンダーを削除したい場合は、Googleカレンダーの設定から「Tokyo Music Union イベントカレンダー」の購読を解除してください。
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
