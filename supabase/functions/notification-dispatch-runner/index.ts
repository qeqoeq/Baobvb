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

  const raw = data as unknown;
  let dispatched = 0;
  let usersProcessed = 0;
  let usersLockSkipped = 0;
  let effectiveLimit = limit;

  if (raw && typeof raw === 'object' && raw !== null && 'sent' in raw) {
    const o = raw as Record<string, unknown>;
    dispatched = Number(o.sent ?? 0);
    usersProcessed = Number(o.usersProcessed ?? 0);
    usersLockSkipped = Number(o.usersLockSkipped ?? 0);
    if (typeof o.limit === 'number' && Number.isFinite(o.limit)) {
      effectiveLimit = o.limit;
    }
  } else if (typeof raw === 'number') {
    dispatched = raw;
  } else {
    dispatched = Number(raw ?? 0);
  }

  const elapsedMs = Date.now() - start;
  console.log('notification-dispatch-runner completed', {
    limit: effectiveLimit,
    dispatched,
    usersProcessed,
    usersLockSkipped,
    elapsedMs,
  });
  return jsonResponse(200, {
    ok: true,
    dispatched,
    usersProcessed,
    usersLockSkipped,
    limit: effectiveLimit,
    elapsedMs,
  });
});
