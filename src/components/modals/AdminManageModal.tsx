import { useState, useEffect } from 'react'
import type { AdminInfo, AdminInvitation } from '../../types/models'

interface Props {
  open: boolean
  refreshTrigger: number
  onClose: () => void
  onInviteClick: () => void
  onDeleteClick: (userId: string, adminName: string) => void
  onListAdmins: () => Promise<{ success: boolean; admins?: AdminInfo[]; error?: string }>
  onListInvitations: () => Promise<{ success: boolean; invitations?: AdminInvitation[]; error?: string }>
  onCancelInvitation: (token: string) => Promise<{ success: boolean; error?: string }>
}

function getRemainingDays(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days <= 0) return '期限切れ'
  if (days === 1) return '残り1日'
  return `残り${days}日`
}

export function AdminManageModal({ open, refreshTrigger, onClose, onInviteClick, onDeleteClick, onListAdmins, onListInvitations, onCancelInvitation }: Props) {
  const [admins, setAdmins] = useState<AdminInfo[]>([])
  const [invitations, setInvitations] = useState<AdminInvitation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancellingToken, setCancellingToken] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    Promise.all([onListAdmins(), onListInvitations()]).then(([adminsResult, invitationsResult]) => {
      setLoading(false)
      if (adminsResult.success) setAdmins(adminsResult.admins ?? [])
      else setError(adminsResult.error ?? '管理者一覧の取得に失敗しました')
      if (invitationsResult.success) setInvitations(invitationsResult.invitations ?? [])
    })
  }, [open, refreshTrigger])

  const handleCancelInvitation = async (token: string) => {
    setCancellingToken(token)
    setError(null)
    const result = await onCancelInvitation(token)
    setCancellingToken(null)
    if (result.success) {
      setInvitations(prev => prev.filter(i => i.token !== token))
    } else {
      setError(result.error ?? '招待の取消に失敗しました')
    }
  }

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2>管理者管理</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">

          {/* 現在の管理者 */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold' }}>現在の管理者</h3>
              <button className="form-btn primary" style={{ padding: '6px 16px', fontSize: '0.9rem' }} onClick={onInviteClick}>
                + 招待する
              </button>
            </div>

            {loading ? (
              <p style={{ color: '#666' }}>読み込み中...</p>
            ) : admins.length === 0 ? (
              <p style={{ color: '#666' }}>管理者が登録されていません</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {admins.map(admin => (
                  <li
                    key={admin.userId}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 0', borderBottom: '1px solid #eee', gap: '8px',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                        {admin.displayName ?? '（名前未設定）'}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {admin.email}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{
                        fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px',
                        backgroundColor: admin.role === 'owner' ? '#e8f5e9' : '#e3f2fd',
                        color: admin.role === 'owner' ? '#2e7d32' : '#1565c0',
                      }}>
                        {admin.role === 'owner' ? 'オーナー' : '管理者'}
                      </span>
                      <button
                        className="form-btn danger"
                        style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                        disabled={admin.role === 'owner'}
                        title={admin.role === 'owner' ? 'オーナーは削除できません' : undefined}
                        onClick={() => onDeleteClick(admin.userId, admin.displayName ?? admin.email)}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 招待中 */}
          {invitations.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 'bold' }}>招待中（未承認）</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {invitations.map(inv => (
                  <li
                    key={inv.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 0', borderBottom: '1px solid #eee', gap: '8px',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{inv.displayName}</div>
                      <div style={{ fontSize: '0.82rem', color: '#666' }}>
                        {inv.email}　<span style={{ color: '#f57c00' }}>{getRemainingDays(inv.expiresAt)}</span>
                      </div>
                    </div>
                    <button
                      className="form-btn secondary"
                      style={{ padding: '4px 12px', fontSize: '0.85rem', flexShrink: 0 }}
                      disabled={cancellingToken === inv.token}
                      onClick={() => handleCancelInvitation(inv.token)}
                    >
                      {cancellingToken === inv.token ? '取消中...' : '取消'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p style={{ color: '#c62828', fontSize: '0.9rem', marginTop: '8px' }}>{error}</p>
          )}

        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="form-btn secondary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  )
}
