// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type DequeueJob = {
  outbox_id: string;
  expo_push_token: string;
  payload: Record<string, unknown>;
};

type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

function jsonResponse(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(Math.trunc(value), 200));
}

async function sendExpoPush(
  token: string,
  payload: Record<string, unknown>,
): Promise<{ success: boolean; errorMessage: string | null }> {
  let response: Response;
  try {
    response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title: 'Your link is ready',
        body: 'Open Baobab to reveal it',
        sound: 'default',
        data: payload,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, errorMessage: `Network error: ${msg}` };
  }

  if (!response.ok) {
    return { success: false, errorMessage: `Expo HTTP ${response.status}` };
  }

  let expoBody: { data?: ExpoTicket[] };
  try {
    expoBody = await response.json();
  } catch {
    return { success: false, errorMessage: 'Expo response JSON parse error' };
  }

  const ticket = expoBody?.data?.[0];
  if (!ticket) {
    return { success: false, errorMessage: 'Expo response missing data[0]' };
  }
  if (ticket.status === 'ok') {
    return { success: true, errorMessage: null };
  }

  // status === 'error': extract the most specific signal available.
  const detailError = ticket.details?.error ?? ticket.message ?? 'Unknown Expo error';
  return { success: false, errorMessage: detailError };
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

  let body: { limit?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const limit = parseLimit(body.limit);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const start = Date.now();

  const { data: jobs, error: dequeueError } = await admin.rpc(
    'dequeue_pending_notifications_for_dispatch',
    { p_limit: limit },
  );
  if (dequeueError) {
    console.error('notification-dispatch-runner dequeue error', dequeueError);
    return jsonResponse(500, { error: dequeueError.message });
  }

  const jobList = (Array.isArray(jobs) ? jobs : []) as DequeueJob[];

  let sent = 0;
  let failed = 0;
  let tokenDeactivated = 0;

  for (const job of jobList) {
    const { success, errorMessage } = await sendExpoPush(job.expo_push_token, job.payload);

    const { error: ackError } = await admin.rpc('ack_notification_dispatch', {
      p_outbox_id: job.outbox_id,
      p_expo_push_token: job.expo_push_token,
      p_success: success,
      p_error_message: errorMessage,
    });

    if (ackError) {
      console.error('notification-dispatch-runner ack error', {
        outbox_id: job.outbox_id,
        ackError,
      });
    }

    if (success) {
      sent++;
    } else {
      failed++;
      if (errorMessage?.includes('DeviceNotRegistered')) {
        tokenDeactivated++;
      }
    }
  }

  const elapsedMs = Date.now() - start;
  console.log('notification-dispatch-runner completed', {
    limit,
    jobCount: jobList.length,
    sent,
    failed,
    tokenDeactivated,
    elapsedMs,
  });

  return jsonResponse(200, {
    ok: true,
    dispatched: sent,
    failed,
    tokenDeactivated,
    jobCount: jobList.length,
    limit,
    elapsedMs,
  });
});
