interface Props { onCalendar: () => void; onReload: () => void; loading?: boolean }
/** Available to all members, including administrators. */
export function MemberActions({ onCalendar, onReload, loading = false }: Props) {
  return <div className="left-actions member-actions"><button className="add-to-calendar-btn secondary-btn" id="add-to-calendar-btn" disabled={loading} onClick={onCalendar}>カレンダーに追加</button><button className="reload-btn secondary-btn" id="reload-btn" disabled={loading} onClick={onReload}>最新表示</button></div>
}
