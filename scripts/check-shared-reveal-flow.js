#!/usr/bin/env node
require('sucrase/register/ts');

const { createClient } = require('@supabase/supabase-js');
const { computeMutualRelationshipScore } = require('../lib/evaluation.ts');

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    'Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY).',
  );
  process.exit(1);
}

const TABLE = 'shared_relationship_reveals';

function createAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function normalizeRpcRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRelationId(runId, caseKey) {
  return `day4-test-${runId}-${caseKey}-${Math.random().toString(36).slice(2, 8)}`;
}

async function signIn(client, label) {
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(`${label} anonymous sign-in failed: ${error?.message || 'missing user'}`);
  }
  return data.user.id;
}

async function attachReading(client, relationshipId, side, readingId, payload) {
  const { data, error } = await client.rpc('attach_shared_private_reading_reference', {
    p_relationship_id: relationshipId,
    p_side: side,
    p_reading_id: readingId,
    p_reading_payload: payload,
  });
  if (error) throw new Error(`attach_shared_private_reading_reference failed: ${error.message}`);
  return normalizeRpcRow(data);
}

async function startCooking(client, relationshipId) {
  const { data, error } = await client.rpc('start_shared_cooking_reveal_if_ready', {
    p_relationship_id: relationshipId,
  });
  if (error) throw new Error(`start_shared_cooking_reveal_if_ready failed: ${error.message}`);
  return normalizeRpcRow(data);
}

async function markReady(client, relationshipId) {
  const { data, error } = await client.rpc('mark_shared_reveal_ready_if_unlocked', {
    p_relationship_id: relationshipId,
  });
  if (error) throw new Error(`mark_shared_reveal_ready_if_unlocked failed: ${error.message}`);
  return normalizeRpcRow(data);
}

async function openReveal(client, relationshipId) {
  const { data, error } = await client.rpc('open_shared_reveal', {
    p_relationship_id: relationshipId,
  });
  if (error) throw new Error(`open_shared_reveal failed: ${error.message}`);
  return normalizeRpcRow(data);
}

async function run() {
  const runId = Date.now();
  const createdRelationshipIds = [];
  const results = [];

  const clientA = createAnonClient();
  const clientB = createAnonClient();
  const clientC = createAnonClient();

  const userA = await signIn(clientA, 'A');
  const userB = await signIn(clientB, 'B');
  const userC = await signIn(clientC, 'C');

  console.log('Shared reveal Day 4 validation');
  console.log(`Run namespace: day4-test-${runId}-*`);
  console.log(`Participants: A=${userA.slice(0, 8)} B=${userB.slice(0, 8)} C=${userC.slice(0, 8)}\n`);

  try {
    // Scenario 1
    const relationS1 = buildRelationId(runId, 's1-single');
    createdRelationshipIds.push(relationS1);
    const payloadS1A = { trust: 4, support: 4, interactions: 3, affinity: 3, sharedNetwork: 2 };
    const rowS1A = await attachReading(clientA, relationS1, 'sideA', `${relationS1}-ra`, payloadS1A);
    assert(rowS1A.relationship_id === relationS1, 'Scenario 1: unexpected relationship row');
    assert(rowS1A.status === 'waiting_other_side', 'Scenario 1: status must stay waiting_other_side');
    assert(rowS1A.mutual_score == null, 'Scenario 1: mutual_score must not be present');
    assert(rowS1A.tier == null, 'Scenario 1: tier must not be present');
    assert(rowS1A.relationship_name_revealed === false, 'Scenario 1: reveal must stay hidden');

    const rowS1Start = await startCooking(clientA, relationS1);
    assert(rowS1Start.status === 'waiting_other_side', 'Scenario 1: start should be no-op without side B');
    results.push('PASS scenario1 single participant remains waiting_other_side without leakage');

    // Scenario 2 + 3 + 4
    const relationS234 = buildRelationId(runId, 's234-lifecycle');
    createdRelationshipIds.push(relationS234);
    const payloadS2A = { trust: 5, support: 5, interactions: 4, affinity: 4, sharedNetwork: 3 };
    const payloadS2B = { trust: 5, support: 4, interactions: 4, affinity: 4, sharedNetwork: 3 };

    await attachReading(clientA, relationS234, 'sideA', `${relationS234}-ra`, payloadS2A);
    await attachReading(clientB, relationS234, 'sideB', `${relationS234}-rb`, payloadS2B);

    const expectedMutual = computeMutualRelationshipScore(payloadS2A, payloadS2B);
    const cookingFirst = await startCooking(clientA, relationS234);
    assert(cookingFirst.status === 'cooking_reveal', 'Scenario 2: status should move to cooking_reveal');
    assert(cookingFirst.mutual_score != null, 'Scenario 2: mutual_score should be frozen');
    assert(cookingFirst.tier != null, 'Scenario 2: tier should be frozen');
    assert(cookingFirst.unlock_at != null, 'Scenario 2: unlock_at should be server-generated');
    assert(
      Number(cookingFirst.mutual_score) === expectedMutual.finalScore && cookingFirst.tier === expectedMutual.tier,
      'Scenario 2: frozen mutual result must match TS formula parity',
    );

    const cookingSecond = await startCooking(clientB, relationS234);
    assert(cookingSecond.status === 'cooking_reveal', 'Scenario 2: repeated start should stay cooking_reveal');
    assert(
      Number(cookingSecond.mutual_score) === Number(cookingFirst.mutual_score) &&
        cookingSecond.tier === cookingFirst.tier &&
        cookingSecond.unlock_at === cookingFirst.unlock_at,
      'Scenario 2: repeated start must not change frozen result/unlock_at',
    );
    results.push('PASS scenario2 both participants trigger one frozen cooking result');

    const readyBeforeUnlock = await markReady(clientA, relationS234);
    assert(readyBeforeUnlock.status === 'cooking_reveal', 'Scenario 3: before unlock should remain cooking_reveal');

    const unlockAtMs = Date.parse(cookingFirst.unlock_at);
    const waitMs = Math.max(0, unlockAtMs - Date.now() + 1200);
    if (waitMs > 0) {
      console.log(`Waiting ${Math.ceil(waitMs / 1000)}s for unlock_at...`);
      await sleep(waitMs);
    }

    const readyAfterUnlock = await markReady(clientB, relationS234);
    assert(readyAfterUnlock.status === 'reveal_ready', 'Scenario 3: after unlock should move to reveal_ready');
    assert(readyAfterUnlock.ready_at != null, 'Scenario 3: ready_at must be set');
    const readyRepeat = await markReady(clientA, relationS234);
    assert(
      readyRepeat.status === 'reveal_ready' && readyRepeat.ready_at === readyAfterUnlock.ready_at,
      'Scenario 3: repeated ready call must be idempotent',
    );
    results.push('PASS scenario3 ready transition and idempotence');

    const opened = await openReveal(clientA, relationS234);
    assert(opened.status === 'revealed', 'Scenario 4: open should move to revealed');
    assert(opened.first_viewed_at != null, 'Scenario 4: first_viewed_at must be set');
    assert(opened.revealed_at != null, 'Scenario 4: revealed_at must be set');
    const firstViewedAt = opened.first_viewed_at;
    const revealedAt = opened.revealed_at;

    const openedAgain = await openReveal(clientB, relationS234);
    assert(openedAgain.status === 'revealed', 'Scenario 4: repeated open should stay revealed');
    assert(
      openedAgain.first_viewed_at === firstViewedAt && openedAgain.revealed_at === revealedAt,
      'Scenario 4: repeated open must not corrupt first/revealed timestamps',
    );
    results.push('PASS scenario4 reveal open transition and idempotence');

    // Scenario 6
    const { data: nonParticipantRead, error: nonParticipantReadError } = await clientC
      .from(TABLE)
      .select('*')
      .eq('relationship_id', relationS234)
      .maybeSingle();
    assert(!nonParticipantReadError, `Scenario 6: unexpected read error: ${nonParticipantReadError?.message}`);
    assert(nonParticipantRead == null, 'Scenario 6: non-participant should not read row');

    const { error: protectedUpdateError } = await clientA
      .from(TABLE)
      .update({ status: 'waiting_other_side' })
      .eq('relationship_id', relationS234);
    assert(Boolean(protectedUpdateError), 'Scenario 6: participant must not mutate protected lifecycle fields directly');

    const { data: nonParticipantMutateData, error: nonParticipantMutateError } = await clientC
      .from(TABLE)
      .update({ side_b_reading_id: 'blocked-attempt' })
      .eq('relationship_id', relationS234)
      .select('*')
      .maybeSingle();
    assert(
      Boolean(nonParticipantMutateError) || nonParticipantMutateData == null,
      'Scenario 6: non-participant mutation must be blocked',
    );
    results.push('PASS scenario6 participant-only access and protected field enforcement');

    console.log('\nValidation summary');
    for (const line of results) console.log(`- ${line}`);
    console.log(`\nCreated relationship ids (namespaced, disposable):\n- ${createdRelationshipIds.join('\n- ')}`);
    console.log(
      '\nNote: rows are intentionally namespaced and left in place for auditability; no cleanup performed.',
    );
  } catch (error) {
    console.error('\nFAIL shared reveal validation');
    console.error(error instanceof Error ? error.message : error);
    console.error(`\nCreated relationship ids so far:\n- ${createdRelationshipIds.join('\n- ')}`);
    process.exitCode = 1;
  }
}

void run();
