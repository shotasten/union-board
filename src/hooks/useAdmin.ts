import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, SPACE_ID } from '../lib/supabase'

export function useAdmin() {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setIsAdmin(false); return }
    supabase.rpc('is_space_admin', { p_space_id: SPACE_ID })
      .then(({ data }) => setIsAdmin(data === true))
  }, [session])

  return { session, isAdmin }
}
