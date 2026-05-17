import { useState, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import type { AttendanceEvent, AttendanceResponse, Config, Member, ResponseStatus } from '../types/models'

// ===== Types =====

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastState {
  message: string
  type: ToastType
  id: number
}

export interface FullscreenLoaderState {
  text: string
}

export interface ModalState {
  adminLogin: boolean
  event: { open: boolean; eventId: string | null }
  eventDetail: { open: boolean; eventId: string | null }
  deleteConfirm: { open: boolean; eventId: string | null; eventTitle: string }
  memberRegister: boolean
  memberEdit: { open: boolean; memberKey: string | null }
  memberInfoEdit: boolean
  displayPeriod: boolean
  clearDisplayPeriodConfirm: boolean
  memberDeleteConfirm: { open: boolean; memberKey: string | null; memberName: string }
  cleanupMembersResponses: boolean
  cleanupMembersResponsesFinalConfirm: boolean
  syncConfirmation: boolean
  logoutConfirmation: boolean
  addToCalendar: boolean
}

export interface AppState {
  events: AttendanceEvent[]
  members: Member[]
  responsesMap: Record<string, AttendanceResponse[]>
  config: Config | null
  isAdmin: boolean
  isLoading: boolean
  error: string | null
  toast: ToastState | null
  fullscreenLoader: FullscreenLoaderState | null
  modals: ModalState
  selectedMember: string | null
  // Local status overrides: { eventId: { displayName: status } }
  localStatusOverrides: Record<string, Record<string, ResponseStatus | '-'>>
}

const PART_ORDER = ['Fl', 'Ob', 'Cl', 'Sax', 'Hr', 'Tp', 'Tb', 'Bass', 'Perc', 'その他']

const PART_LABELS: Record<string, string> = {
  'Fl': 'Fl (フルート)',
  'Ob': 'Ob (オーボエ)',
  'Cl': 'Cl (クラリネット)',
  'Sax': 'Sax (サックス)',
  'Hr': 'Hr (ホルン)',
  'Tp': 'Tp (トランペット)',
  'Tb': 'Tb (トロンボーン)',
  'Bass': 'Bass (バス)',
  'Perc': 'Perc (打楽器)',
  'その他': 'その他'
}

export { PART_ORDER, PART_LABELS }

const initialModalState: ModalState = {
  adminLogin: false,
  event: { open: false, eventId: null },
  eventDetail: { open: false, eventId: null },
  deleteConfirm: { open: false, eventId: null, eventTitle: '' },
  memberRegister: false,
  memberEdit: { open: false, memberKey: null },
  memberInfoEdit: false,
  displayPeriod: false,
  clearDisplayPeriodConfirm: false,
  memberDeleteConfirm: { open: false, memberKey: null, memberName: '' },
  cleanupMembersResponses: false,
  cleanupMembersResponsesFinalConfirm: false,
  syncConfirmation: false,
  logoutConfirmation: false,
  addToCalendar: false,
}

let toastIdCounter = 0

export function useAppState() {
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [responsesMap, setResponsesMap] = useState<Record<string, AttendanceResponse[]>>({})
  const [config, setConfig] = useState<Config | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [fullscreenLoader, setFullscreenLoader] = useState<FullscreenLoaderState | null>(null)
  const [modals, setModals] = useState<ModalState>(initialModalState)
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [localStatusOverrides, setLocalStatusOverrides] = useState<Record<string, Record<string, ResponseStatus | '-'>>>({})

  // Keep a ref to responsesMap for use in callbacks without stale closures
  const responsesMapRef = useRef(responsesMap)
  responsesMapRef.current = responsesMap
  const membersRef = useRef(members)
  membersRef.current = members
  const eventsRef = useRef(events)
  eventsRef.current = events
  const configRef = useRef(config)
  configRef.current = config

  // ===== Toast =====
  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++toastIdCounter
    setToast({ message, type, id })
    setTimeout(() => {
      setToast(prev => prev?.id === id ? null : prev)
    }, 3000)
  }, [])

  // ===== Fullscreen Loader =====
  const showFullscreenLoader = useCallback((text = '処理中...') => {
    setFullscreenLoader({ text })
  }, [])

  const hideFullscreenLoader = useCallback(() => {
    setFullscreenLoader(null)
  }, [])

  // ===== Modal helpers =====
  const openModal = useCallback((key: keyof ModalState, value?: unknown) => {
    setModals(prev => ({
      ...prev,
      [key]: value !== undefined ? value : true,
    }))
  }, [])

  const closeModal = useCallback((key: keyof ModalState) => {
    setModals(prev => ({
      ...prev,
      [key]: key === 'event' || key === 'eventDetail' || key === 'deleteConfirm' || key === 'memberEdit' || key === 'memberDeleteConfirm'
        ? { ...initialModalState[key] }
        : false,
    }))
  }, [])

  // ===== Admin check =====
  const checkAdminStatus = useCallback(async (): Promise<boolean> => {
    const adminToken = localStorage.getItem('adminToken')
    if (!adminToken) {
      setIsAdmin(false)
      return false
    }
    try {
      const result = await api.checkAdminStatus('', adminToken)
      setIsAdmin(result)
      return result
    } catch {
      setIsAdmin(false)
      return false
    }
  }, [])

  // ===== Load initial data =====
  const loadInitData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Handle URL ?admin= param
    const urlParams = new URLSearchParams(window.location.search)
    const adminTokenFromUrl = urlParams.get('admin')
    if (adminTokenFromUrl) {
      localStorage.setItem('adminToken', adminTokenFromUrl)
      const newUrl = window.location.pathname + window.location.hash
      window.history.replaceState({}, document.title, newUrl)
    }

    try {
      const data = await api.getInitData()
      setConfig(data.config)
      setMembers(data.members)
      setEvents(data.events)
      setResponsesMap(data.responsesMap)
      setIsLoading(false)

      // Check admin status in parallel
      const adminResult = await checkAdminStatus()
      if (adminTokenFromUrl && adminResult) {
        showToast('管理者ログインに成功しました', 'success')
      }
    } catch (e) {
      setIsLoading(false)
      setError('データの取得に失敗しました。ブラウザのコンソールを確認してください。')
      await checkAdminStatus()
    }
  }, [checkAdminStatus, showToast])

  // ===== Reload =====
  const reloadEvents = useCallback(async () => {
    try {
      await loadInitData()
      showToast('最新のデータを読み込みました', 'success')
    } catch {
      showToast('再読み込みに失敗しました', 'error')
    }
  }, [loadInitData, showToast])

  // ===== Admin login =====
  const handleAdminLogin = useCallback(async (token: string): Promise<boolean> => {
    try {
      const result = await api.checkAdminStatus('', token)
      if (result) {
        localStorage.setItem('adminToken', token)
        setIsAdmin(true)
        closeModal('adminLogin')
        showToast('管理者ログインに成功しました', 'success')
        await loadInitData()
        return true
      } else {
        showToast('管理者トークンが正しくありません', 'error')
        return false
      }
    } catch {
      showToast('ログインに失敗しました', 'error')
      return false
    }
  }, [closeModal, loadInitData, showToast])

  // ===== Admin logout =====
  const handleAdminLogout = useCallback(async () => {
    localStorage.removeItem('adminToken')
    setIsAdmin(false)
    closeModal('logoutConfirmation')
    showToast('管理者ログアウトしました', 'success')
    await loadInitData()
  }, [closeModal, loadInitData, showToast])

  // ===== Member registration =====
  const handleRegisterMember = useCallback(async (part: string, name: string): Promise<boolean> => {
    const displayName = part + name
    const isDuplicate = membersRef.current.some(m => m.part === part && m.name === name)
    if (isDuplicate) {
      showToast('同じパートと名前の組み合わせが既に登録されています', 'error')
      return false
    }

    const userKey = crypto.randomUUID()
    const newMember: Member = {
      userKey,
      part,
      name,
      displayName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Optimistic update
    setMembers(prev => [...prev, newMember])

    try {
      const result = await api.createMember(userKey, part, name, displayName)
      if (result.success) {
        closeModal('memberRegister')
        showToast('メンバーを登録しました', 'success')
        return true
      } else {
        // Rollback
        setMembers(prev => prev.filter(m => m.userKey !== userKey))
        showToast(result.error || 'メンバー登録に失敗しました', 'error')
        return false
      }
    } catch {
      // Rollback
      setMembers(prev => prev.filter(m => m.userKey !== userKey))
      showToast('メンバー登録に失敗しました', 'error')
      return false
    }
  }, [closeModal, showToast])

  // ===== Member info update =====
  const handleUpdateMemberInfo = useCallback(async (
    userKey: string,
    newPart: string,
    newName: string,
  ): Promise<boolean> => {
    const newDisplayName = newPart + newName
    const oldMember = membersRef.current.find(m => m.userKey === userKey)
    if (!oldMember) {
      showToast('メンバー情報が見つかりません', 'error')
      return false
    }

    const isDuplicate = membersRef.current.some(m =>
      m.userKey !== userKey && m.part === newPart && m.name === newName
    )
    if (isDuplicate) {
      showToast('同じパートと名前の組み合わせが既に登録されています', 'error')
      return false
    }

    // Optimistic update
    setMembers(prev => prev.map(m =>
      m.userKey === userKey
        ? { ...m, part: newPart, name: newName, displayName: newDisplayName, updatedAt: new Date().toISOString() }
        : m
    ))

    try {
      const result = await api.updateMember(userKey, newPart, newName, newDisplayName)
      if (result.success) {
        showToast('メンバー情報を更新しました', 'success')

        // Fire-and-forget calendar sync for events this member has responded to
        const eventIdsWithResponse = Object.keys(responsesMapRef.current).filter(eventId => {
          const resps = responsesMapRef.current[eventId] || []
          return resps.some(r => r.userKey === userKey)
        })
        if (eventIdsWithResponse.length > 0) {
          api.syncAttendance(eventIdsWithResponse).then(result => {
            if (result.failed > 0) console.warn('[calendar-sync] syncAttendance failed:', result.errors)
          }).catch(e => console.warn('[calendar-sync] syncAttendance error:', e))
        }

        return true
      } else {
        // Rollback
        setMembers(prev => prev.map(m => m.userKey === userKey ? oldMember : m))
        showToast(result.error || 'メンバー更新に失敗しました', 'error')
        return false
      }
    } catch {
      // Rollback
      setMembers(prev => prev.map(m => m.userKey === userKey ? oldMember : m))
      showToast('メンバー更新に失敗しました', 'error')
      return false
    }
  }, [showToast])

  // ===== Member delete =====
  const handleDeleteMember = useCallback(async (userKey: string): Promise<boolean> => {
    const member = membersRef.current.find(m => m.userKey === userKey)
    if (!member) return false

    // Collect event IDs where this member has responses (before deletion)
    const eventIdsToSync = Object.keys(responsesMapRef.current).filter(eventId => {
      const resps = responsesMapRef.current[eventId] || []
      return resps.some(r => r.userKey === userKey)
    })

    // Optimistic update
    setMembers(prev => prev.filter(m => m.userKey !== userKey))
    setResponsesMap(prev => {
      const updated = { ...prev }
      Object.keys(updated).forEach(eventId => {
        updated[eventId] = updated[eventId].filter(r => r.userKey !== userKey)
      })
      return updated
    })

    try {
      const result = await api.deleteMemberAPI(userKey)
      if (result.success) {
        closeModal('memberDeleteConfirm')
        closeModal('memberEdit')
        setSelectedMember(null)
        setLocalStatusOverrides(prev => {
          // Clean up overrides for this member
          const updated = { ...prev }
          Object.keys(updated).forEach(eventId => {
            const displayName = member.part + member.name
            if (updated[eventId][displayName] !== undefined) {
              const eventOverrides = { ...updated[eventId] }
              delete eventOverrides[displayName]
              updated[eventId] = eventOverrides
            }
          })
          return updated
        })
        showToast('メンバーを削除しました', 'success')
        // Sync calendar to remove deleted member from event descriptions
        if (eventIdsToSync.length > 0) {
          api.syncAttendance(eventIdsToSync).then(r => {
            if (r.failed > 0) console.warn('[calendar-sync] syncAttendance after delete failed:', r.errors)
          }).catch(e => console.warn('[calendar-sync] syncAttendance after delete error:', e))
        }
        return true
      } else {
        // Rollback
        setMembers(prev => [...prev, member])
        setResponsesMap(responsesMapRef.current)
        showToast(result.error || 'メンバー削除に失敗しました', 'error')
        return false
      }
    } catch {
      // Rollback
      setMembers(prev => [...prev, member])
      setResponsesMap(responsesMapRef.current)
      showToast('メンバー削除に失敗しました', 'error')
      return false
    }
  }, [closeModal, showToast])

  // ===== Bulk responses update =====
  const handleBulkUpdateResponses = useCallback(async (
    memberUserKey: string,
    memberDisplayName: string,
    updates: Array<{ eventId: string; status: ResponseStatus | '-'; comment: string }>
  ): Promise<boolean> => {
    if (updates.length === 0) {
      showToast('更新するデータがありません', 'info')
      return false
    }

    try {
      const batchUpdates = updates.map(u => ({
        eventId: u.eventId,
        userKey: memberUserKey,
        status: u.status as ResponseStatus,
        comment: u.comment || undefined,
      }))

      const result = await api.userSubmitResponsesBatch(batchUpdates)

      if (result.failed === 0) {
        // Update local responsesMap
        setResponsesMap(prev => {
          const updated = { ...prev }
          updates.forEach(u => {
            const existing = updated[u.eventId] || []
            const idx = existing.findIndex(r => r.userKey === memberUserKey)
            const now = new Date().toISOString()
            if (idx >= 0) {
              const newArr = [...existing]
              newArr[idx] = { ...newArr[idx], status: u.status as ResponseStatus, comment: u.comment || undefined, updatedAt: now }
              updated[u.eventId] = newArr
            } else {
              updated[u.eventId] = [...existing, {
                eventId: u.eventId,
                userKey: memberUserKey,
                status: u.status as ResponseStatus,
                comment: u.comment || undefined,
                createdAt: now,
                updatedAt: now,
              }]
            }
          })
          return updated
        })

        // Clear local overrides for this member
        setLocalStatusOverrides(prev => {
          const updated = { ...prev }
          updates.forEach(u => {
            if (updated[u.eventId]) {
              const eventOverrides = { ...updated[u.eventId] }
              delete eventOverrides[memberDisplayName]
              updated[u.eventId] = eventOverrides
            }
          })
          return updated
        })

        showToast(`${result.success}件の出欠を更新しました`, 'success')

        // Fire-and-forget calendar sync
        const uniqueEventIds = [...new Set(updates.map(u => u.eventId))]
        api.syncAttendance(uniqueEventIds).then(result => {
          if (result.failed > 0) console.warn('[calendar-sync] syncAttendance failed:', result.errors)
        }).catch(e => console.warn('[calendar-sync] syncAttendance error:', e))

        closeModal('memberEdit')
        setSelectedMember(null)
        return true
      } else {
        showToast(`${result.success}件成功、${result.failed}件失敗しました`, 'error')
        return false
      }
    } catch {
      showToast('保存に失敗しました', 'error')
      return false
    }
  }, [closeModal, showToast])

  // ===== Event CRUD =====
  const handleCreateEvent = useCallback(async (eventData: {
    title: string; start: string; end: string; isAllDay: boolean; location: string; description: string
  }): Promise<boolean> => {
    const adminToken = localStorage.getItem('adminToken')
    if (!adminToken) { showToast('管理者権限が必要です', 'error'); return false }

    try {
      const result = await api.adminCreateEvent(eventData, '', adminToken)
      if (result.success && result.event) {
        setEvents(prev => [...prev, result.event!].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()))
        setResponsesMap(prev => ({ ...prev, [result.event!.id]: [] }))
        showToast('イベントを作成しました', 'success')
        closeModal('event')
        // Fire-and-forget calendar sync
        api.syncEvent(result.event.id, '', adminToken).then(r => {
          if (!r.success) console.warn('[calendar-sync] syncEvent (create) failed:', r.error)
        }).catch(e => console.warn('[calendar-sync] syncEvent (create) error:', e))
        return true
      } else {
        showToast(result.error || '作成に失敗しました', 'error')
        return false
      }
    } catch {
      showToast('エラーが発生しました', 'error')
      return false
    }
  }, [closeModal, showToast])

  const handleUpdateEvent = useCallback(async (eventId: string, updates: {
    title: string; start: string; end: string; isAllDay: boolean; location: string; description: string
  }): Promise<boolean> => {
    const adminToken = localStorage.getItem('adminToken')
    if (!adminToken) { showToast('管理者権限が必要です', 'error'); return false }

    try {
      const result = await api.adminUpdateEvent(eventId, updates, '', adminToken)
      if (result.success) {
        showToast('イベントを更新しました', 'success')
        closeModal('event')
        await loadInitData()
        api.syncEvent(eventId, '', adminToken).then(r => {
          if (!r.success) console.warn('[calendar-sync] syncEvent (update) failed:', r.error)
        }).catch(e => console.warn('[calendar-sync] syncEvent (update) error:', e))
        return true
      } else {
        showToast(result.error || '更新に失敗しました', 'error')
        return false
      }
    } catch {
      showToast('エラーが発生しました', 'error')
      return false
    }
  }, [closeModal, loadInitData, showToast])

  const handleDeleteEvent = useCallback(async (eventId: string): Promise<boolean> => {
    const adminToken = localStorage.getItem('adminToken')
    if (!adminToken) { showToast('管理者権限が必要です', 'error'); return false }

    try {
      const result = await api.adminDeleteEvent(eventId, '', adminToken)
      if (result.success) {
        setEvents(prev => prev.filter(e => e.id !== eventId))
        setResponsesMap(prev => {
          const updated = { ...prev }
          delete updated[eventId]
          return updated
        })
        showToast('イベントを削除しました', 'success')
        closeModal('deleteConfirm')
        api.syncEvent(eventId, '', adminToken).then(r => {
          if (!r.success) console.warn('[calendar-sync] syncEvent (delete) failed:', r.error)
        }).catch(e => console.warn('[calendar-sync] syncEvent (delete) error:', e))
        return true
      } else {
        showToast(result.error || '削除に失敗しました', 'error')
        return false
      }
    } catch {
      showToast('エラーが発生しました', 'error')
      return false
    }
  }, [closeModal, showToast])

  // ===== Display period =====
  const handleSaveDisplayPeriod = useCallback(async (
    startDateISO: string,
    endDateISO: string,
    showOnlyFuture: boolean
  ): Promise<boolean> => {
    const adminToken = localStorage.getItem('adminToken')
    if (!adminToken) return false

    try {
      const [periodResult, flagResult] = await Promise.all([
        api.adminSetDisplayPeriod(startDateISO, endDateISO, '', adminToken),
        api.adminSetShowOnlyFutureEvents(showOnlyFuture, '', adminToken),
      ])

      if (periodResult.success && flagResult.success) {
        setConfig(prev => prev ? {
          ...prev,
          DISPLAY_START_DATE: startDateISO,
          DISPLAY_END_DATE: endDateISO,
          SHOW_ONLY_FUTURE_EVENTS: showOnlyFuture ? 'true' : 'false',
        } : prev)
        closeModal('displayPeriod')
        showToast('表示期間を設定しました', 'success')
        await loadInitData()
        return true
      } else {
        showToast('設定の保存に失敗しました', 'error')
        return false
      }
    } catch {
      showToast('設定の保存に失敗しました', 'error')
      return false
    }
  }, [closeModal, loadInitData, showToast])

  const handleClearDisplayPeriod = useCallback(async (): Promise<boolean> => {
    const adminToken = localStorage.getItem('adminToken')
    if (!adminToken) return false

    try {
      const [periodResult, flagResult] = await Promise.all([
        api.adminSetDisplayPeriod('', '', '', adminToken),
        api.adminSetShowOnlyFutureEvents(false, '', adminToken),
      ])

      if (periodResult.success && flagResult.success) {
        setConfig(prev => prev ? {
          ...prev,
          DISPLAY_START_DATE: '',
          DISPLAY_END_DATE: '',
          SHOW_ONLY_FUTURE_EVENTS: 'false',
        } : prev)
        closeModal('clearDisplayPeriodConfirm')
        showToast('表示期間の制限を解除しました', 'success')
        await loadInitData()
        return true
      } else {
        showToast('制限の解除に失敗しました', 'error')
        return false
      }
    } catch {
      showToast('制限の解除に失敗しました', 'error')
      return false
    }
  }, [closeModal, loadInitData, showToast])

  // ===== Cleanup members =====
  const handleCleanupMembersAndResponses = useCallback(async (): Promise<boolean> => {
    const adminToken = localStorage.getItem('adminToken')
    if (!adminToken) return false

    showFullscreenLoader('メンバーとレスポンスデータを削除中...')
    try {
      const result = await api.adminCleanupMembersAndResponses('', adminToken)
      hideFullscreenLoader()

      if (result.success) {
        setMembers([])
        setResponsesMap({})
        setLocalStatusOverrides({})
        setSelectedMember(null)
        closeModal('cleanupMembersResponsesFinalConfirm')
        showToast(
          `メンバーとレスポンスデータ削除完了:\nMembers: ${result.membersDeleted}件\nResponses: ${result.responsesDeleted}件`,
          'success'
        )
        await loadInitData()
        return true
      } else {
        showToast('削除に失敗しました', 'error')
        return false
      }
    } catch (e) {
      hideFullscreenLoader()
      showToast('エラーが発生しました', 'error')
      return false
    }
  }, [closeModal, hideFullscreenLoader, loadInitData, showFullscreenLoader, showToast])

  // ===== Sync all events =====
  const handleSyncAllEvents = useCallback(async (): Promise<void> => {
    const adminToken = localStorage.getItem('adminToken')
    if (!adminToken) return

    closeModal('syncConfirmation')
    showFullscreenLoader('全イベントをカレンダーに同期中...')

    try {
      const result = await api.syncAllEvents('', adminToken, true)
      hideFullscreenLoader()

      if (result.success > 0 || result.failed === 0) {
        let message = `同期完了: 成功 ${result.success}件`
        if (result.failed > 0) message += `, 失敗 ${result.failed}件`
        showToast(message, 'success')
        await loadInitData()
      } else {
        showToast('同期に失敗しました', 'error')
      }
    } catch {
      hideFullscreenLoader()
      showToast('エラーが発生しました', 'error')
    }
  }, [closeModal, hideFullscreenLoader, loadInitData, showFullscreenLoader, showToast])

  // ===== Local overrides =====
  const setLocalOverride = useCallback((eventId: string, displayName: string, status: ResponseStatus | '-') => {
    setLocalStatusOverrides(prev => ({
      ...prev,
      [eventId]: {
        ...(prev[eventId] || {}),
        [displayName]: status,
      }
    }))
  }, [])

  const clearLocalOverridesForMember = useCallback((displayName: string) => {
    setLocalStatusOverrides(prev => {
      const updated = { ...prev }
      Object.keys(updated).forEach(eventId => {
        if (updated[eventId][displayName] !== undefined) {
          const eventOverrides = { ...updated[eventId] }
          delete eventOverrides[displayName]
          updated[eventId] = eventOverrides
        }
      })
      return updated
    })
  }, [])

  return {
    // State
    events,
    members,
    responsesMap,
    config,
    isAdmin,
    isLoading,
    error,
    toast,
    fullscreenLoader,
    modals,
    selectedMember,
    localStatusOverrides,
    // Actions
    loadInitData,
    reloadEvents,
    showToast,
    showFullscreenLoader,
    hideFullscreenLoader,
    openModal,
    closeModal,
    setSelectedMember,
    setLocalOverride,
    clearLocalOverridesForMember,
    handleAdminLogin,
    handleAdminLogout,
    handleRegisterMember,
    handleUpdateMemberInfo,
    handleDeleteMember,
    handleBulkUpdateResponses,
    handleCreateEvent,
    handleUpdateEvent,
    handleDeleteEvent,
    handleSaveDisplayPeriod,
    handleClearDisplayPeriod,
    handleCleanupMembersAndResponses,
    handleSyncAllEvents,
    setEvents,
    setMembers,
    setResponsesMap,
    setConfig,
  }
}
