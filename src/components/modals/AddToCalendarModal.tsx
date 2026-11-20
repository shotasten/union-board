import { useState } from 'react'
import type { Config } from '../../types/models'

interface Props {
  open: boolean
  config: Config | null
  onClose: () => void
}

export function AddToCalendarModal({ open, config, onClose }: Props) {
  const [copyMessage, setCopyMessage] = useState('')
  if (!open) return null

  const calendarId = (config as unknown as Record<string, string> | null)?.['CALENDAR_ID'] || ''
  const calendarUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(calendarId)}`
  const icsUrl = (import.meta.env.VITE_CALENDAR_ICS_URL as string | undefined)?.trim() || ''
  const validIcsUrl = /^https:\/\//i.test(icsUrl)
  const webcalUrl = validIcsUrl ? icsUrl.replace(/^https:/i, 'webcal:') : ''

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(icsUrl)
      setCopyMessage('購読URLをコピーしました')
    } catch {
      setCopyMessage('コピーできませんでした。下のURLを選択してコピーしてください。')
    }
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content calendar-modal-content" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h2>TMU Eventをカレンダーに追加</h2>
          <button type="button" className="close-btn" aria-label="閉じる" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body calendar-options">
          <section>
            <p>追加すると、同じGoogleアカウントのGoogleカレンダーで予定を確認できます。予定の追加・変更・削除は自動で反映されます。</p>
            {calendarId ? <a id="calendar-add-link" href={calendarUrl} target="_blank" rel="noopener noreferrer" className="calendar-add-link">Googleカレンダーに追加</a> : <p>カレンダーIDが設定されていません。管理者に連絡してください。</p>}
            <p>スマホで追加画面を開けない場合は、PCのブラウザで追加してください。</p>
            <div className="calendar-hint calendar-iphone-guide">
              <h3>Google経由でiPhone標準カレンダーに表示する</h3>
              <p>Googleカレンダーに追加した後、次の設定を行ってください。</p>
              <ol>
                <li><a href="https://calendar.google.com/calendar/syncselect" target="_blank" rel="noopener noreferrer">Googleの同期設定を開く</a></li>
                <li>「TMU Event」にチェックを入れて保存する</li>
              </ol>
              <p><strong>ご注意：</strong>同じ端末でGoogle経由の同期と直接購読を両方設定すると、予定が重複する場合があります。</p>
            </div>
          </section>
          <section>
            <h3>対応カレンダーアプリで購読</h3>
            <p>iPhone・iPadの標準カレンダーや、Androidの購読に対応したカレンダーアプリで利用できます。購読後は予定が自動で更新されます。反映には時間がかかる場合があります。</p>
            <p>AndroidでGoogleカレンダーをお使いの場合は、上の「Googleカレンダーに追加」をご利用ください。</p>
            {validIcsUrl ? <>
              <a className="form-btn secondary calendar-secondary-link" href={webcalUrl}>対応カレンダーアプリで購読</a>{' '}
              <button type="button" className="form-btn secondary" onClick={copyUrl}>購読URLをコピー</button>
              <p role="status">{copyMessage}</p>
              {copyMessage.startsWith('コピーできません') && <input aria-label="購読URL" readOnly value={icsUrl} onFocus={e => e.currentTarget.select()} />}
            </> : <p>購読URLが設定されていません。管理者に連絡してください。</p>}
          </section>
        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="form-btn secondary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  )
}
