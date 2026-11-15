import { useEffect, useRef, useState } from 'react'
import type { AttendanceEvent, AttendanceResponse, Member, ResponseStatus } from '../types/models'
import { sortMembersByPart, getMemberDisplayName, cleanDescription, PART_OPTIONS } from '../lib/utils'
import { changedResponses, eventDateLabel, eventTimeLabel, memberResponse, RESPONSE_LABELS, RESPONSE_STATUSES, responseClass, tallyAttendance } from '../lib/attendance'
import { BoardDialog } from './BoardDialog'
import { AttendanceGrid } from './AttendanceGrid'
import './AttendanceExperience.css'

type Scope = 'all' | 'pending' | string
interface Props {
  events: AttendanceEvent[]; members: Member[]; responsesMap: Record<string, AttendanceResponse[]>; isAdmin: boolean
  selectedMember: string | null; localStatusOverrides: Record<string, Record<string, ResponseStatus>>
  storageScope: string; onRegisterMember: (part: string, name: string) => Promise<Member | null>; onMemberClick: (name: string) => void
  onSave: (key: string, name: string, updates: Array<{ eventId: string; status: ResponseStatus; comment: string }>) => Promise<boolean>
  onEditEvent: (id: string) => void; onDeleteEvent: (id: string, title: string) => void
}
function readIdentity(key: string) { try { return localStorage.getItem(key) || '' } catch { return '' } }
function dismissedIdentity(key: string) { try { return sessionStorage.getItem(key) === 'true' } catch { return false } }
function hashEvent() { try { return location.hash.startsWith('#event/') ? decodeURIComponent(location.hash.slice(7)) : '' } catch { return '' } }
const countLabel = (value: number) => value || '-'
function Answer({ status }: { status: ResponseStatus }) { return <span className={'board-answer ' + responseClass(status)}>{status}<span className="board-answer-label">{RESPONSE_LABELS[status]}</span></span> }

export function AttendanceExperience(props: Props) {
  const { events, members, responsesMap, isAdmin, onMemberClick, onSave, onEditEvent, onDeleteEvent } = props
  const identityStorage = 'unionboard:member:' + props.storageScope
  const [identityKey, setIdentityKey] = useState(() => readIdentity(identityStorage))
  const identity = members.find(m => m.userKey === identityKey)
  const [eventId, setEventId] = useState(hashEvent)
  const [tab, setTab] = useState<'parts' | 'people'>('parts')
  const [partFilter, setPartFilter] = useState('')
  const [showTable, setShowTable] = useState(false)
  const dismissalStorage = 'unionboard:identity-dismissed:' + props.storageScope
  const [choosing, setChoosing] = useState(() => !identity && !dismissedIdentity(dismissalStorage))
  const [choice, setChoice] = useState(identityKey)
  const [remember, setRemember] = useState(true)
  const [choicePart, setChoicePart] = useState('')
  const [registering, setRegistering] = useState(false)
  const [newName, setNewName] = useState('')
  const [registerBusy, setRegisterBusy] = useState(false)
  const [registerError, setRegisterError] = useState('')
  const [pendingScope, setPendingScope] = useState<Scope | null>(null)
  const [editor, setEditor] = useState<{ key: string; scope: Scope; eventIds: string[] } | null>(null)
  const listScroll = useRef(0)
  const tabRef = useRef<HTMLDivElement>(null)
  const groups = sortMembersByPart(members)
  const sortedEvents = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  const event = events.find(e => e.id === eventId)
  const responses = event ? responsesMap[event.id] || [] : []
  const status = (id: string, key: string): ResponseStatus => memberResponse(responsesMap[id] || [], key)?.status || '-'

  useEffect(() => {
    const navigate = () => { setEventId(hashEvent()); setTab('parts'); setPartFilter('') }
    const home = () => { listScroll.current = 0; setEventId(''); setShowTable(false) }; window.addEventListener('unionboard:home', home)
    window.addEventListener('hashchange', navigate)
    window.addEventListener('popstate', navigate)
    return () => { window.removeEventListener('unionboard:home', home); window.removeEventListener('hashchange', navigate); window.removeEventListener('popstate', navigate) }
  }, [])
  useEffect(() => { window.scrollTo(0, eventId ? 0 : listScroll.current) }, [eventId])
  useEffect(() => {
    const label = event ? eventDateLabel(event) + ' ' + event.title : '予定一覧'
    document.title = label + ' | UnionBoard'
  }, [event])

  const navigate = (id: string) => {
    if (!eventId) listScroll.current = window.scrollY
    location.hash = id ? 'event/' + encodeURIComponent(id) : 'schedule'
  }
  const startEditor = (key: string, scope: Scope) => {
    const scoped = sortedEvents.filter(e => scope === 'all' || scope === 'pending' ? scope !== 'pending' || status(e.id, key) === '-' : e.id === scope)
    setEditor({ key, scope, eventIds: scoped.map(e => e.id) })
  }
  const edit = (scope: Scope) => {
    if (identity) startEditor(identity.userKey, scope)
    else { setChoice(''); setChoicePart(''); setRegistering(false); setRegisterError(''); setPendingScope(scope); setChoosing(true) }
  }
  const acceptIdentity = (key: string) => {
    setIdentityKey(key)
    try { if (remember) localStorage.setItem(identityStorage, key); else localStorage.removeItem(identityStorage) } catch { /* Selection still works for this visit. */ }
    setChoosing(false); setRegistering(false)
    if (pendingScope) startEditor(key, pendingScope)
    setPendingScope(null)
  }
  const dismissChoosing = () => {
    if (registerBusy) return
    setChoosing(false); setPendingScope(null)
    try { sessionStorage.setItem(dismissalStorage, 'true') } catch { /* Browsing remains optional. */ }
  }
  const choose = () => { if (members.some(m => m.userKey === choice)) acceptIdentity(choice) }
  const registerIdentity = async () => {
    const name = newName.trim()
    if (!choicePart || !name || registerBusy) return
    const existing = members.find(m => m.part === choicePart && m.name === name)
    if (existing) { setChoice(existing.userKey); setRegistering(false); setRegisterError('この名前は登録済みです。名前を選んで進んでください。'); return }
    setRegisterBusy(true); setRegisterError('')
    try {
      const member = await props.onRegisterMember(choicePart, name)
      if (member) { setNewName(''); acceptIdentity(member.userKey) }
      else setRegisterError('登録できませんでした。入力内容を確認し、もう一度お試しください。')
    } catch { setRegisterError('登録できませんでした。入力内容は保持しています。') }
    finally { setRegisterBusy(false) }
  }
  const switchTab = (next: 'parts' | 'people') => {
    const pinned = (tabRef.current?.getBoundingClientRect().top || 0) <= 1
    setTab(next); setPartFilter('')
    if (pinned) requestAnimationFrame(() => tabRef.current?.scrollIntoView({ block: 'start' }))
  }
  const pending = identity ? events.filter(e => status(e.id, identity.userKey) === '-').length : 0
  return <section className="board-experience">
    <div className="board-person-bar"><button aria-describedby={!identity ? 'board-identity-hint' : undefined} className={!identity ? 'board-primary' : undefined} onClick={() => { setPendingScope(null); setChoice(identity?.userKey || ''); setChoicePart(''); setRegistering(false); setRegisterError(''); setChoosing(true) }}>{identity ? identity.name + '（' + identity.part + '）' : '自分の名前を選ぶ'}</button>
      {identity && <><button className="board-primary" onClick={() => edit(pending ? 'pending' : 'all')}>{pending ? '未定 ' + pending + '件を入力' : '出欠を変更'}</button><button onClick={() => edit('all')}>まとめて変更</button><button onClick={() => onMemberClick(getMemberDisplayName(identity))}>名前・パートを編集</button></>}
    </div>
    {!identity && <p id="board-identity-hint" className="board-identity-hint">まずは自分の名前を選ぶと、出欠をすぐに入力できます。閲覧だけなら選択不要です。</p>}
    {!eventId ? <>
      <div className="board-page-heading"><h2>予定一覧</h2><span>{events.length}件</span></div>
      <div className="board-view-tools"><button aria-pressed={showTable} onClick={() => setShowTable(v => !v)}>{showTable ? '予定一覧に戻る' : '日程 × メンバーの全体表'}</button></div>
      {showTable ? <AttendanceGrid {...props} onEventClick={navigate} /> : <ul className="board-schedule">{sortedEvents.map(ev => {
        const counts = tallyAttendance(members, responsesMap[ev.id] || [])
        return <li key={ev.id} className="board-cassette"><a href={'#event/' + encodeURIComponent(ev.id)} onClick={click => { if (!click.metaKey && !click.ctrlKey && !click.shiftKey && !click.altKey) { click.preventDefault(); navigate(ev.id) } }} className="board-event-link">
          <span className="board-event-date"><strong>{eventDateLabel(ev)}</strong><span>{ev.title || '予定'}</span><small>{eventTimeLabel(ev)}</small></span>
          <span className="board-event-place">{ev.location || '場所未設定'}</span>
          <span className="board-event-count"><small>参加予定</small><strong>{counts['○'] + counts['△']}<small>人</small></strong><span>○{countLabel(counts['○'])} · △{countLabel(counts['△'])}</span></span>
        </a><button className="board-self" aria-label={eventDateLabel(ev) + ' 自分の出欠を編集'} onClick={() => edit(ev.id)}><small>自分</small>{identity ? <span className={'board-self-mark ' + responseClass(status(ev.id, identity.userKey))}>{status(ev.id, identity.userKey)}</span> : <span>未選択</span>}<small>変更</small></button></li>
      })}</ul>}
      {!events.length && <p className="board-empty">表示期間内に予定はありません。</p>}
      <p className="board-note">参加予定＝○出席＋△遅刻/早退。同時に全員が揃うとは限りません。<br />未回答と未定は「-」で表示します。0件の内訳は「-」です。</p>
    </> : event ? <>
      <a className="board-back" href="#schedule" onClick={click => { click.preventDefault(); navigate('') }}>← 予定一覧</a>
      <section className="board-summary"><h2>{eventDateLabel(event)} {event.title}</h2><p>{eventTimeLabel(event)}</p><strong>{event.location || '場所未設定'}</strong>{event.description && <p className="board-description">{cleanDescription(event.description)}</p>}
        <div className="board-counts">{RESPONSE_STATUSES.map(s => <span className={'board-answer ' + responseClass(s)} key={s}>{s} {countLabel(tallyAttendance(members, responses)[s])}人</span>)}</div><button onClick={() => edit(event.id)}>{identity ? identity.name + 'の出欠・コメントを変更' : '自分の出欠・コメントを入力'}</button>
      </section>
      <section className="board-comments" aria-labelledby="board-comments-title"><div className="board-section-heading"><h3 id="board-comments-title">コメント</h3><button onClick={() => edit(event.id)}>書く・編集</button></div>
        {responses.filter(r => members.some(m => m.userKey === r.userKey) && r.comment?.trim()).map(r => {
          const member = members.find(m => m.userKey === r.userKey)!
          return <article key={r.userKey}><div><Answer status={r.status} /><strong>{member.part} {member.name}</strong></div><p>{r.comment}</p></article>
        })}
        {!responses.some(r => members.some(m => m.userKey === r.userKey) && r.comment?.trim()) && <p className="board-note">まだコメントはありません。</p>}
      </section>
      {isAdmin && <div className="board-admin-event"><strong>管理者操作</strong><button onClick={() => onEditEvent(event.id)}>イベント編集</button><button className="board-danger" onClick={() => onDeleteEvent(event.id, event.title)}>削除</button></div>}
      <div ref={tabRef} className="board-tabs" role="tablist" aria-label="出欠内訳" onKeyDown={key => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key.key)) return
        key.preventDefault(); const next = key.key === 'Home' ? 'parts' : key.key === 'End' ? 'people' : tab === 'parts' ? 'people' : 'parts'
        switchTab(next); requestAnimationFrame(() => document.getElementById('board-tab-' + next)?.focus({ preventScroll: true }))
      }}>{(['parts', 'people'] as const).map(key => <button id={'board-tab-' + key} key={key} role="tab" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => switchTab(key)}>{key === 'parts' ? 'パート別' : '全員の出欠'}</button>)}</div>
      <div role="tabpanel" aria-labelledby="board-tab-parts" hidden={tab !== 'parts'}><h3>パート別の人数</h3><p className="board-note">○出席 · △遅刻/早退 · ×欠席 · -未定</p><dl className="board-part-list">{[...groups].map(([part, group]) => {
        const counts = tallyAttendance(group, responses)
        return <div className="board-part-row" key={part}><dt><button onClick={() => { switchTab('people'); setPartFilter(part); requestAnimationFrame(() => document.getElementById('board-tab-people')?.focus({ preventScroll: true })) }}>{part} <small>{group.length}人 ›</small></button></dt><dd>{RESPONSE_STATUSES.map(s => <span key={s} className={'board-answer ' + responseClass(s)} aria-label={part + ' ' + RESPONSE_LABELS[s] + ' ' + counts[s] + '人'}>{s} {countLabel(counts[s])}</span>)}</dd></div>
      })}</dl></div>
      <div role="tabpanel" aria-labelledby="board-tab-people" hidden={tab !== 'people'}>{partFilter && <button className="board-roster-reset" onClick={() => setPartFilter('')}>← 全員を表示</button>}<p className="board-note">この日の出欠。名前から、その人の全日程と名前・パートの編集へ。</p><div className="board-roster">{[...groups].filter(([part]) => !partFilter || part === partFilter).map(([part, group]) => {
        const counts = tallyAttendance(group, responses)
        return <section key={part}><h3>{part} <small>{group.length}人</small><span>○{countLabel(counts['○'])} · △{countLabel(counts['△'])}</span></h3><ul>{group.map(member => <li key={member.userKey}><button onClick={() => onMemberClick(getMemberDisplayName(member))}><span>{member.name}</span><Answer status={status(event.id, member.userKey)} /></button></li>)}</ul></section>
      })}</div></div>
    </> : <p>この日程は現在の表示期間にありません。<a href="#schedule">予定一覧へ戻る</a></p>}
    {choosing && <BoardDialog title="あなたの名前は？" busy={registerBusy} onClose={dismissChoosing}><form className="board-dialog-body board-identity-form" onSubmit={submit => { submit.preventDefault(); if (registering) void registerIdentity(); else choose() }}>
      <div className="board-identity-notice" role="note"><strong>自分の出欠を、すぐに確認・入力できます</strong><p>パートと名前を選んでください。名前がなければ、この画面で登録できます。閲覧だけなら登録・選択は不要です。</p></div>
      <label>パート<select disabled={registerBusy} value={choicePart} onChange={e => { setChoicePart(e.target.value); setChoice(''); setRegisterError('') }}><option value="">{registering ? 'パートを選んでください' : '全パート'}</option>{(registering ? PART_OPTIONS.map(p => p.value) : [...groups.keys()]).map(p => <option key={p}>{p}</option>)}</select></label>
      {registering ? <><label>名前<input autoFocus disabled={registerBusy} value={newName} maxLength={50} placeholder="例：山田" onChange={e => setNewName(e.target.value)} /></label><p className="board-note">名前はメンバー全員に公開されます。フルネームの入力は控えてください。</p></> : <><label>名前<select value={choice} onChange={e => { setChoice(e.target.value); setRegisterError('') }}><option value="">選んでください</option>{members.filter(m => !choicePart || m.part === choicePart).map(m => <option key={m.userKey} value={m.userKey}>{m.name}（{m.part}）</option>)}</select></label><button type="button" className="board-register-link" onClick={() => { setRegistering(true); setRegisterError('') }}>名前を登録する</button></>}
      <label className="board-checkbox"><input disabled={registerBusy} type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />この端末で覚える</label>
      <p className="board-note">ログインや本人確認ではありません。共有端末では記憶を外してください。</p>
      {registerError && <p role="alert" className="board-registration-error">{registerError}</p>}
      <div className="board-identity-actions"><button type="submit" className="board-primary" disabled={registerBusy || (registering ? !choicePart || !newName.trim() : !choice)}>{registerBusy ? '登録中…' : registering ? '登録して進む' : 'この名前で進む'}</button>{registering && <button type="button" disabled={registerBusy} onClick={() => { setRegistering(false); setRegisterError('') }}>登録済みの名前から選ぶ</button>}</div>
      {!identity && <button type="button" disabled={registerBusy} className="board-browse-only" onClick={dismissChoosing}>登録せずに見る</button>}
      {identity && !registering && <><button type="button" onClick={() => { setChoosing(false); onMemberClick(getMemberDisplayName(identity)) }}>名前・パートを編集</button><button type="button" onClick={() => { setIdentityKey(''); try { localStorage.removeItem(identityStorage) } catch { /* memory is optional */ } setChoosing(false) }}>自分の選択を解除</button></>}
    </form></BoardDialog>}
    {editor && members.some(m => m.userKey === editor.key) && <ResponseEditor key={editor.key + ':' + editor.scope} member={members.find(m => m.userKey === editor.key)!} events={sortedEvents.filter(e => editor.eventIds.includes(e.id))} responses={Object.values(responsesMap).flat().filter(r => r.userKey === editor.key)} onSave={onSave} onClose={() => setEditor(null)} />}
  </section>
}

function ResponseEditor({ member, events, responses, onSave, onClose }: { member: Member; events: AttendanceEvent[]; responses: AttendanceResponse[]; onSave: Props['onSave']; onClose: () => void }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(events.map(e => { const response = responses.find(r => r.eventId === e.id); return [e.id, { status: response?.status || '-' as ResponseStatus, comment: response?.comment || '' }] })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const updates = changedResponses(events, responses, draft)
  const close = () => { if (!busy) onClose() }
  const save = async () => {
    if (!updates.length || busy) return
    setBusy(true); setError('')
    try { if (await onSave(member.userKey, getMemberDisplayName(member), updates)) onClose(); else setError('保存できませんでした。入力内容を保持しています。再度保存してください。') }
    catch { setError('保存できませんでした。入力内容を保持しています。') }
    finally { setBusy(false) }
  }
  return <BoardDialog title={member.name + '（' + member.part + '）の出欠'} onClose={close} busy={busy}><div className="board-dialog-body"><p className="board-note">表示 {events.length}件。変更した回答・コメントだけを保存します。</p>{!events.length && <p>入力対象の日程はありません。</p>}{events.map(e => <fieldset className="board-editor-event" key={e.id}><legend>{eventDateLabel(e)} {e.title}</legend><p className="board-note">{e.location || '場所未設定'}<br />{eventTimeLabel(e)}</p><div className="board-choices">{RESPONSE_STATUSES.map(s => <button key={s} disabled={busy} className={responseClass(s)} aria-pressed={draft[e.id].status === s} onClick={() => setDraft(prev => ({ ...prev, [e.id]: { ...prev[e.id], status: s } }))}>{s}<small>{RESPONSE_LABELS[s]}</small></button>)}</div><label>コメント（任意）<textarea disabled={busy} value={draft[e.id].comment} onChange={input => setDraft(prev => ({ ...prev, [e.id]: { ...prev[e.id], comment: input.target.value } }))} /></label></fieldset>)}</div><div className="board-dialog-footer"><span role="status">{error || updates.length + '件変更'}</span><button disabled={busy} onClick={close}>取消</button><button className="board-primary" disabled={busy || !updates.length} onClick={save}>{busy ? '保存中…' : '保存'}</button></div></BoardDialog>
}
