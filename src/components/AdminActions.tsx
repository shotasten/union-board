interface Props {
  onDisplayPeriod: () => void
  onCleanup: () => void
  onCreateEvent: () => void
}

export function AdminActions({ onDisplayPeriod, onCleanup, onCreateEvent }: Props) {
  return (
    <div className="main-actions-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
      <div className="right-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button id="display-period-edit-btn" className="secondary-btn" onClick={onDisplayPeriod}>表示期間を設定</button>
        <button id="cleanup-members-responses-btn" className="danger-btn" onClick={onCleanup}>新年度リセット</button>
        <button id="create-event-btn" className="admin-feature primary-btn create-event-btn" onClick={onCreateEvent}>イベント登録</button>
      </div>
    </div>
  )
}
