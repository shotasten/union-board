interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SPACE_ID: string;
  SUPABASE_KEEPALIVE_TOKEN?: string;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(recordKeepalive(env));
  },
};

async function recordKeepalive(env: Env): Promise<void> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/record_keepalive`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_space_id: env.SPACE_ID,
      p_token: env.SUPABASE_KEEPALIVE_TOKEN ?? "",
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase keep-alive failed (HTTP ${response.status}): ${body.slice(0, 500)}`);
  }

  let result: { success?: boolean; lastPingAt?: string; pingCount?: number };
  try {
    result = JSON.parse(body) as typeof result;
  } catch {
    throw new Error(`Supabase keep-alive returned invalid JSON: ${body.slice(0, 500)}`);
  }

  if (result.success !== true) {
    throw new Error(`Supabase keep-alive RPC rejected the request: ${body.slice(0, 500)}`);
  }

  console.log(`Supabase keep-alive succeeded: ${result.lastPingAt} (${result.pingCount})`);
}
