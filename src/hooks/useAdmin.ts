import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, SPACE_ID } from '../lib/supabase'

export function useAdmin() {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    console.log('[useAdmin] effect1 start: calling getSession + onAuthStateChange')
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[useAdmin] getSession resolved, session:', session ? 'exists' : 'null')
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((e, s) => {
      console.log('[useAdmin] onAuthStateChange event:', e, 'session:', s ? 'exists' : 'null')
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let stale = false
    if (!session) {
      setIsAdmin(false)
      return
    }
    console.log('[useAdmin] session exists, calling is_space_admin RPC')
    supabase.rpc('is_space_admin', { p_space_id: SPACE_ID }).then(({ data, error }) => {
      if (error) console.error('[useAdmin] is_space_admin error:', error)
      console.log('[useAdmin] is_space_admin result:', data)
      if (!stale) setIsAdmin(data === true)
    })
    return () => { stale = true }
  }, [session])

  return { session, isAdmin }
}
