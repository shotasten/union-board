import { useState } from 'react'
import { BoardDialog } from '../BoardDialog'

interface Props {
  open: boolean
  memberKey: string | null
  memberName: string
  onClose: () => void
  onConfirm: (memberKey: string) => Promise<boolean>
}

export function MemberDeleteConfirmModal({ open, memberKey, memberName, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  if (!open || !memberKey) return null

  const confirm = async () => {
    setLoading(true)
    setError('')
    try {
      if (await onConfirm(memberKey)) onClose()
      else setError('削除できませんでした。もう一度お試しください。')
    } catch {
      setError('削除できませんでした。もう一度お試しください。')
    } finally { setLoading(false) }
  }

  return <BoardDialog title="メンバー削除の確認" onClose={onClose} busy={loading}>
    <div className="board-dialog-body">
      <p><strong>{memberName}</strong> を削除しますか？</p>
      <p className="board-note">このメンバーの全ての出欠データも削除されます。この操作は取り消せません。</p>
      {error && <p role="alert" className="board-registration-error">{error}</p>}
    </div>
    <div className="board-dialog-footer"><button disabled={loading} onClick={onClose}>キャンセル</button><button className="board-danger" disabled={loading} onClick={() => void confirm()}>{loading ? '削除中…' : '削除'}</button></div>
  </BoardDialog>
}
