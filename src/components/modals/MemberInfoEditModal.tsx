import { useEffect, useState } from 'react'
import { PART_OPTIONS } from '../../lib/utils'
import type { Member } from '../../types/models'
import { BoardDialog } from '../BoardDialog'

interface Props {
  open: boolean
  member: Member | null
  onClose: () => void
  onSave: (userKey: string, newPart: string, newName: string) => Promise<boolean>
}

export function MemberInfoEditModal({ open, member, onClose, onSave }: Props) {
  const [part, setPart] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !member) return
    setPart(member.part || '')
    setName(member.name || '')
    setError('')
  }, [open, member])

  if (!open || !member) return null

  const hasChanged = part !== member.part || name.trim() !== member.name
  const save = async () => {
    if (!part || !name.trim() || !hasChanged || busy) return
    setBusy(true)
    setError('')
    try {
      if (await onSave(member.userKey, part, name.trim())) onClose()
      else setError('保存できませんでした。入力内容は保持しています。もう一度お試しください。')
    } catch {
      setError('保存できませんでした。入力内容は保持しています。もう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  return <BoardDialog title="名前・パートを編集" onClose={onClose} busy={busy}>
    <div className="board-dialog-body">
      <p className="board-note">現在の登録内容を変更します。名前はメンバー全員に公開されます。</p>
      <label>パート
        <select disabled={busy} value={part} onChange={e => setPart(e.target.value)}>
          <option value="">選択してください</option>
          {PART_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>名前
        <input disabled={busy} type="text" maxLength={50} value={name} onChange={e => setName(e.target.value)} />
      </label>
      {error && <p role="alert" className="board-registration-error">{error}</p>}
    </div>
    <div className="board-dialog-footer">
      <span>{error ? '内容を保持しています' : '出欠・コメントはこの画面では変更しません'}</span>
      <button disabled={busy} onClick={onClose}>キャンセル</button>
      <button className="board-primary" disabled={busy || !part || !name.trim() || !hasChanged} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button>
    </div>
  </BoardDialog>
}
