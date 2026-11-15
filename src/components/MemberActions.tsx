interface Props { onRegister: () => void; onCalendar: () => void; onReload: () => void }
/** Available to all members, including administrators. */
export function MemberActions({ onRegister, onCalendar, onReload }: Props) {
  return <div className="left-actions member-actions"><button className="member-register-btn primary-btn" onClick={onRegister}>メンバー登録</button><button className="add-to-calendar-btn secondary-btn" id="add-to-calendar-btn" onClick={onCalendar}>カレンダーに追加</button><button className="reload-btn secondary-btn" id="reload-btn" onClick={onReload}>最新表示</button></div>
}
