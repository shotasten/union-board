import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, SPACE_ID } from '../lib/supabase'

async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_space_admin', { p_space_id: SPACE_ID })
  if (error) console.error('[useAdmin] is_space_admin error:', error)
  return data === true
}

export function useAdmin() {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s)
      if (s && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        setIsAdmin(await checkIsAdmin())
      } else if (!s) {
        setIsAdmin(false)
      }
    })

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session) setIsAdmin(await checkIsAdmin())
    })

    return () => subscription.unsubscribe()
  }, [])

  return { session, isAdmin }
}
