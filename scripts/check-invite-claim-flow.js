const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase env vars. Source .env before running this script.');
  process.exit(1);
}

function buildClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signInAnonymous(client, label) {
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(`${label}: anonymous sign-in failed (${error?.message || 'no user'})`);
  }
  return data.user.id.slice(0, 8);
}

const payload = {
  trust: 4,
  support: 4,
  interactions: 4,
  affinity: 4,
  sharedNetwork: 4,
};

async function main() {
  const runNs = `day6-verify-${Date.now()}`;
  const relationshipId = require('crypto').randomUUID();

  const a = buildClient();
  const b = buildClient();
  const c = buildClient();

  const [aId, bId, cId] = await Promise.all([
    signInAnonymous(a, 'A'),
    signInAnonymous(b, 'B'),
    signInAnonymous(c, 'C'),
  ]);

  console.log('Invite claim validation');
  console.log(`Run namespace: ${runNs}`);
  console.log(`Participants: A=${aId} B=${bId} C=${cId}`);

  const createRes = await a.rpc('create_relationship_invite', {
    p_relationship_id: relationshipId,
    p_inviter_side: 'sideA',
    p_ttl_minutes: 60,
  });
  if (createRes.error || !Array.isArray(createRes.data) || !createRes.data[0]?.invite_token) {
    throw new Error(`create_relationship_invite failed: ${createRes.error?.message || 'no token'}`);
  }
  const inviteToken = createRes.data[0].invite_token;
  console.log('- PASS create invite token');

  const claimByB = await b.rpc('claim_relationship_invite', { p_invite_token: inviteToken });
  if (claimByB.error || !Array.isArray(claimByB.data) || claimByB.data[0]?.claimed_side !== 'sideB') {
    throw new Error(`first claim failed: ${claimByB.error?.message || 'bad claim response'}`);
  }
  console.log('- PASS first claim succeeds for target side');

  const secondClaim = await c.rpc('claim_relationship_invite', { p_invite_token: inviteToken });
  if (!secondClaim.error) {
    throw new Error('second claim unexpectedly succeeded');
  }
  console.log('- PASS second claim rejected');

  const nonOwnerAttach = await c.rpc('attach_shared_private_reading_reference', {
    p_relationship_id: relationshipId,
    p_side: 'sideB',
    p_reading_id: `${runNs}-c-side-b`,
    p_reading_payload: payload,
  });
  if (!nonOwnerAttach.error) {
    throw new Error('non-owner attach unexpectedly succeeded');
  }
  console.log('- PASS non-owner attach rejected');

  const ownerAttach = await b.rpc('attach_shared_private_reading_reference', {
    p_relationship_id: relationshipId,
    p_side: 'sideB',
    p_reading_id: `${runNs}-b-side-b`,
    p_reading_payload: payload,
  });
  if (ownerAttach.error) {
    throw new Error(`owner attach failed: ${ownerAttach.error.message}`);
  }
  console.log('- PASS owner attach succeeds');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`- FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
