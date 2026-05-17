import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, SPACE_ID } from '../lib/supabase'

export function useAdmin() {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[useAdmin] getSession:', session?.user?.email ?? 'null')
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((e, s) => {
      console.log('[useAdmin] onAuthStateChange:', e, s?.user?.email ?? 'null')
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
    console.log('[useAdmin] calling is_space_admin for', session.user.id)
    supabase.rpc('is_space_admin', { p_space_id: SPACE_ID }).then(({ data, error }) => {
      console.log('[useAdmin] is_space_admin result:', data, 'error:', error)
      if (error) console.error('[useAdmin] is_space_admin error:', error)
      if (!stale) setIsAdmin(data === true)
    })
    return () => { stale = true }
  }, [session])

  return { session, isAdmin }
}
