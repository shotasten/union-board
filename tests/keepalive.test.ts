import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleRequest } from '../cloudflare/keepalive/src/index'

const env = { SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'anon', SPACE_ID: 'space', SUPABASE_KEEPALIVE_TOKEN: 'secret' }

afterEach(() => vi.restoreAllMocks())

describe('keep-alive worker endpoint', () => {
  it('rejects wrong method or path before contacting Supabase', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    expect((await handleRequest(new Request('https://worker.example/keepalive', { method: 'GET' }), env)).status).toBe(404)
    expect((await handleRequest(new Request('https://worker.example/other', { method: 'POST' }), env)).status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires the configured bearer token', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const response = await handleRequest(new Request('https://worker.example/keepalive', { method: 'POST' }), env)
    expect(response.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('calls the RPC and returns its successful payload', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, lastPingAt: 'now', pingCount: 4 }), { status: 200 }))
    const response = await handleRequest(new Request('https://worker.example/keepalive', { method: 'POST', headers: { Authorization: 'Bearer secret' } }), env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, lastPingAt: 'now', pingCount: 4 })
    expect(fetch).toHaveBeenCalledWith('https://db.example/rest/v1/rpc/record_keepalive', expect.objectContaining({ method: 'POST' }))
  })

  it.each([new Response('failure', { status: 503 }), new Response('{"success":false}', { status: 200 }), new Response('not-json', { status: 200 })])('converts RPC failures to 502', async rpcResponse => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse)
    const response = await handleRequest(new Request('https://worker.example/keepalive', { method: 'POST', headers: { Authorization: 'Bearer secret' } }), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ success: false, error: 'Keep-alive failed' })
  })
})
