interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SPACE_ID: string;
  SUPABASE_KEEPALIVE_TOKEN?: string;
}

export type { Env };

export async function handleRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/keepalive") {
      return new Response("Not Found", { status: 404 });
    }

    const expectedToken = env.SUPABASE_KEEPALIVE_TOKEN;
    const authorization = request.headers.get("Authorization");
    if (!expectedToken || authorization !== `Bearer ${expectedToken}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const result = await recordKeepalive(env);
      return Response.json(result);
    } catch (error: unknown) {
      console.error("Supabase keep-alive failed:", error);
      return Response.json({ success: false, error: "Keep-alive failed" }, { status: 502 });
    }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },

  async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<void> {
    ctx.waitUntil(
      recordKeepalive(env).catch((error: unknown) => {
        console.error("Supabase keep-alive failed:", error);
        throw error;
      }),
    );
  },
};

export default worker;

async function recordKeepalive(env: Env): Promise<{ success: true; lastPingAt?: string; pingCount?: number }> {
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

  return { success: true, lastPingAt: result.lastPingAt, pingCount: result.pingCount };
}
