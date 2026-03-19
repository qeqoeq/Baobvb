// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

type RunnerBody = {
  limit?: number;
};

function jsonResponse(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function parseLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(Math.trunc(value), 500));
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed. Use POST.' });
  }

  const expectedSecret = Deno.env.get('DISPATCH_RUNNER_SECRET');
  if (!expectedSecret) {
    return jsonResponse(500, { error: 'DISPATCH_RUNNER_SECRET is not configured.' });
  }

  const providedSecret =
    request.headers.get('x-dispatch-secret') ??
    request.headers.get('x-runner-secret') ??
    null;
  if (!providedSecret || providedSecret !== expectedSecret) {
    return jsonResponse(401, { error: 'Unauthorized runner invocation.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' });
  }

  let body: RunnerBody = {};
  try {
    body = (await request.json()) as RunnerBody;
  } catch {
    body = {};
  }
  const limit = parseLimit(body.limit);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const start = Date.now();
  const { data, error } = await admin.rpc('dispatch_pending_notifications_batch', {
    p_limit: limit,
  });
  if (error) {
    console.error('notification-dispatch-runner rpc error', error);
    return jsonResponse(500, { error: error.message });
  }

  const dispatched = typeof data === 'number' ? data : Number(data ?? 0);
  const elapsedMs = Date.now() - start;
  console.log('notification-dispatch-runner completed', { limit, dispatched, elapsedMs });
  return jsonResponse(200, {
    ok: true,
    dispatched,
    limit,
    elapsedMs,
  });
});
