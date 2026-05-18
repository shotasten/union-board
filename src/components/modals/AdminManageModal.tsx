import { useState, useEffect } from 'react'
import type { AdminInfo, AdminInvitation } from '../../types/models'

interface Props {
  open: boolean
  onClose: () => void
  onListAdmins: () => Promise<{ success: boolean; admins?: AdminInfo[]; error?: string }>
  onListInvitations: () => Promise<{ success: boolean; invitations?: AdminInvitation[]; error?: string }>
  onInviteAdmin: (email: string, displayName: string) => Promise<{ success: boolean; token?: string; error?: string }>
  onRemoveAdmin: (userId: string) => Promise<{ success: boolean; error?: string }>
  onCancelInvitation: (token: string) => Promise<{ success: boolean; error?: string }>
}

function getRemainingDays(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days <= 0) return '期限切れ'
  if (days === 1) return '残り1日'
  return `残り${days}日`
}

export function AdminManageModal({ open, onClose, onListAdmins, onListInvitations, onInviteAdmin, onRemoveAdmin, onCancelInvitation }: Props) {
  const [admins, setAdmins] = useState<AdminInfo[]>([])
  const [invitations, setInvitations] = useState<AdminInvitation[]>([])
  const [loading, setLoading] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [cancellingToken, setCancellingToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const inviteUrl = inviteToken
    ? `${window.location.origin}${window.location.pathname}?admin_invite=${inviteToken}`
    : null

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setInviteToken(null)
    setDisplayName('')
    setEmail('')
    setCopied(false)
    Promise.all([onListAdmins(), onListInvitations()]).then(([adminsResult, invitationsResult]) => {
      setLoading(false)
      if (adminsResult.success) setAdmins(adminsResult.admins ?? [])
      else setError(adminsResult.error ?? '管理者一覧の取得に失敗しました')
      if (invitationsResult.success) setInvitations(invitationsResult.invitations ?? [])
    })
  }, [open])

  const handleInvite = async () => {
    if (!displayName.trim() || !email.trim()) return
    setInviting(true)
    setError(null)
    setInviteToken(null)
    setCopied(false)
    const result = await onInviteAdmin(email.trim(), displayName.trim())
    setInviting(false)
    if (result.success && result.token) {
      setInviteToken(result.token)
      setDisplayName('')
      setEmail('')
      // 既存の同メール招待を上書きした場合、一覧を更新
      const updated = await onListInvitations()
      if (updated.success) setInvitations(updated.invitations ?? [])
    } else {
      setError(result.error ?? '招待URLの発行に失敗しました')
    }
  }

  const handleRemove = async (userId: string) => {
    setRemovingId(userId)
    setError(null)
    const result = await onRemoveAdmin(userId)
    setRemovingId(null)
    if (result.success) {
      setAdmins(prev => prev.filter(a => a.userId !== userId))
    } else {
      setError(result.error ?? '削除に失敗しました')
    }
  }

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

  const handleCopyUrl = async () => {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const labelStyle = { fontSize: '0.85rem', color: '#555', marginBottom: '4px', display: 'block' }
  const sectionTitleStyle = { margin: '0 0 12px', fontSize: '1rem', fontWeight: 'bold' as const }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <h2>管理者管理</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">

          {/* 現在の管理者 */}
          <h3 style={sectionTitleStyle}>現在の管理者</h3>
          {loading ? (
            <p style={{ color: '#666', marginBottom: '24px' }}>読み込み中...</p>
          ) : admins.length === 0 ? (
            <p style={{ color: '#666', marginBottom: '24px' }}>管理者が登録されていません</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
              {admins.map(admin => (
                <li
                  key={admin.userId}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: '1px solid #eee', gap: '8px',
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
                      disabled={admin.role === 'owner' || removingId === admin.userId}
                      title={admin.role === 'owner' ? 'オーナーは削除できません' : undefined}
                      onClick={() => handleRemove(admin.userId)}
                    >
                      {removingId === admin.userId ? '削除中...' : '削除'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* 招待中 */}
          {invitations.length > 0 && (
            <>
              <h3 style={sectionTitleStyle}>招待中（未承認）</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
                {invitations.map(inv => (
                  <li
                    key={inv.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 0', borderBottom: '1px solid #eee', gap: '8px',
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
            </>
          )}

          {/* 管理者を招待 */}
          <h3 style={sectionTitleStyle}>管理者を招待</h3>
          <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#555', lineHeight: '1.5' }}>
            招待URLを発行して招待する管理者に送付してください。相手はURLを開いてGoogleアカウントでログインすると管理者として登録されます。
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '8px' }}>
            <div>
              <label style={labelStyle}>名前</label>
              <input
                type="text"
                className="form-input"
                placeholder="山田太郎"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>メールアドレス</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="yamada@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  className="form-btn primary"
                  onClick={handleInvite}
                  disabled={inviting || !displayName.trim() || !email.trim()}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {inviting ? '発行中...' : 'URL発行'}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p style={{ color: '#c62828', fontSize: '0.9rem', margin: '8px 0 0' }}>{error}</p>
          )}

          {inviteUrl && (
            <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.9rem', fontWeight: 'bold' }}>招待URLが発行されました</p>
              <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#666' }}>有効期限：7日間</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  readOnly
                  className="form-input"
                  value={inviteUrl}
                  style={{ flex: 1, fontSize: '0.78rem', backgroundColor: '#fff' }}
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button className="form-btn secondary" onClick={handleCopyUrl} style={{ whiteSpace: 'nowrap' }}>
                  {copied ? 'コピー済み' : 'コピー'}
                </button>
              </div>
            </div>
          )}

        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="form-btn secondary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  )
}
