import { useSyncExternalStore } from 'react';

import {
  computeMutualRelationshipScore,
  computePrivateLinkScore,
  getTier,
  type Evaluation,
  type PillarKey,
  type PillarRating,
  type Tier,
} from '../lib/evaluation';
import {
  applyProgressivePrivateSignal,
  type ProgressiveCriterionKey,
  type ProgressivePrivateSignals,
  type ProgressivePrivateSignalsByRelation,
} from '../lib/progressive-criteria';
import {
  normalizeRelationModelFields,
  type RelationAnchorMode,
  type RelationDepth,
} from '../lib/relation-model';
import {
  sanitizeRelationOpenWorlds,
  type RelationOpenWorld,
} from '../lib/relation-open-worlds';
import { clearPersistedState, loadPersistedState, persistState } from '../lib/storage';
import {
  findAssistedReconciliationSuggestionForRelation,
  findDraftResolutionSuggestionForRelation,
} from '../lib/assisted-reconciliation';
import {
  normalizePersistedEvaluationTier,
  normalizePersistedRevealSnapshotTier,
} from '../lib/persisted-tier-normalization';
// Dev-only — bundled but only callable inside __DEV__ guard. Tree-shaken in production.
import { generateLargeNetworkSeed } from '../lib/dev/large-network-seed';

export type RelationshipSideIdentityStatus = 'missing' | 'draft' | 'verified';

export type RelationshipSideLocalState = {
  exists: boolean;
  identityStatus: RelationshipSideIdentityStatus;
  hasPrivateReading: boolean;
  privateReadingId?: string;
  resolvedAt?: string;
};

export type RelationshipRevealSnapshot = {
  status: 'waiting_other_side' | 'cooking_reveal' | 'reveal_ready' | 'revealed';
  revealed: boolean;
  cookingStartedAt?: string;
  unlockAt?: string;
  readyAt?: string;
  firstViewedAt?: string;
  revealedAt?: string;
  mutualScore?: number;
  tier?: Tier;
  relationshipNameRevealed?: boolean;
  finalizedVersion?: number;
};

export type RelationshipLocalState = {
  sideA: RelationshipSideLocalState;
  sideB: RelationshipSideLocalState;
  revealSnapshot: RelationshipRevealSnapshot;
};

export type Relation = {
  /**
   * Local draft ID. Device-local, non-canonical.
   * Used for navigation params, AsyncStorage keying, and store lookups.
   * Must never be sent to the backend as a relation join key.
   * See: lib/identity.ts — LocalDraftId
   */
  id: string;
  /**
   * Legacy local label field kept for compatibility.
   * New code should prefer privateLabel when the intent is "how I label this person".
   */
  name: string;
  archived: boolean;
  createdAt: string;
  identityStatus: 'draft' | 'verified';
  relationshipNameRevealed?: boolean;
  handle?: string;
  avatarSeed?: string;
  privateLabel?: string;
  anchorMode?: RelationAnchorMode;
  /**
   * 'manual'    — created by hand
   * 'scan'      — seeded from a scanned QR card
   * 'claim'     — materialized after claiming a shared invite.
   *               Both sides known to exist. canonicalRelationId always set.
   * 'bootstrap' — recovered from backend at app start (shared continuity bootstrap).
   *               Both sides known to exist. canonicalRelationId always set.
   *               Name is a placeholder until the user renames it.
   * 'invite_number' — created via phone-number invite flow. Local label only, invite sent.
   */
  source: 'manual' | 'scan' | 'claim' | 'bootstrap' | 'invite_number';
  /**
   * The scanned card's meId field.
   * v1 QR: opaque legacy local alias — not backend-queryable.
   * v2 QR: mirrors publicProfileId — same value as sourcePublicProfileId.
   * Used for local dedup. Do not use as a backend lookup key without checking version.
   */
  sourceCardMeId?: string;
  /**
   * Canonical public profile identifier of the scanned card owner.
   * Only present for v2 QR scans. Undefined for v1 scans and manual relations.
   * Backend-queryable — use for future lookup and cross-user reconciliation.
   */
  sourcePublicProfileId?: string;
  sourceHandle?: string;
  /**
   * Private anchor value kept on-device for relation detail display.
   * Current bounded use: phone-number invites keep the entered number here
   * so relation/[id] can show a masked anchor instead of treating the label
   * like the person's identity.
   */
  anchorValue?: string | null;
  relationDepth?: RelationDepth;
  localState: RelationshipLocalState;
  /**
   * Canonical relation UUID. Null for purely local relations.
   * Set when this relation is promoted to shared (at invite creation time).
   * This is the only valid cross-user join key for this relation.
   * See: lib/identity.ts — CanonicalRelationId
   */
  canonicalRelationId?: string | null;
  /**
   * The publicProfileId of the other participant in this shared relation.
   * Only set for source: 'claim' and source: 'bootstrap' — never for 'manual' or 'scan'.
   * Null when the counterpart has not provisioned a public profile yet.
   *
   * This is a person signal, not a relation key:
   *   - one person can participate in multiple shared relations
   *   - canonicalRelationId remains the only valid shared↔local join key
   *
   * Current use: persisted for future UI-assisted reconciliation suggestion.
   * Not used for any automatic merge today.
   */
  counterpartPublicProfileId?: string | null;
  /**
   * Via relation ID — the better path to this person.
   *
   * V1 CONSTRAINT: declarative only. Set explicitly by the user (or seed).
   * No algorithmic inference: 2nd-degree trust graph data does not exist yet.
   *
   * When set and the referenced relation is active, this person is shown
   * as a "via" node in the Atlas — present in your world but marked as mediated.
   * UX: dashed border, reduced opacity, tooltip shows "via [Name]".
   *
   * REPLACE with auto-suggested computation when cross-user trust graph is available.
   */
  viaRelationId?: string;
  /**
   * ISO timestamp of the first time the user opened a delivery channel for this relation's invite.
   * Set when the user chooses Messages, WhatsApp, or More options in the invite sheet.
   * Null / undefined if no delivery channel has ever been opened.
   * Does not confirm the message was sent, delivered, or received.
   */
  inviteDeliveryOpenedAt?: string | null;
  /**
   * Private, local-only perception of what worlds this relational path can open.
   * Never sent to the backend. Never displayed with attribution.
   * Gate: isRevealed === true AND trustRating >= 4 AND !isArchived.
   * Max 3 worlds. Canonical order preserved by sanitizeRelationOpenWorlds.
   */
  privateOpenWorlds?: RelationOpenWorld[];
};

export type PlaceCategory = 'restaurant' | 'cafe' | 'bar' | 'spot' | 'other';

export type PlacePersonalFit = 'saved' | 'tried' | 'kept' | 'not_for_me';

export type Place = {
  id: string;
  name: string;
  category: PlaceCategory;
  personalFit: PlacePersonalFit;
  impression?: string;
  createdAt: string;
  sourceRelationId?: string;
};

export type MeProfile = {
  /**
   * Legacy local alias. Not an auth UUID, not a publicProfileId.
   * Kept for backward compatibility. Do not use as a system identity key.
   */
  id: string;
  displayName: string;
  handle: string;
  avatarSeed: string;
  /**
   * Whether to display the Baobab short code on the profile and QR card.
   * Local-first preference. Defaults to true. Only meaningful when publicProfileId is set.
   */
  showBaobabCode: boolean;
  /**
   * True once the user has explicitly configured their profile (name + handle).
   * Used to redirect first-time users to /me/edit before entering the main app.
   * Defaults to false on fresh installs; set to true by setMe.
   */
  isProfileSetup?: boolean;
  /**
   * The Supabase auth UUID (auth.uid()). Private, backend-internal.
   * Never expose in QR cards or public flows.
   * Null until the user has authenticated at least once in this session.
   */
  internalAuthUserId?: string | null;
  /**
   * Stable shareable public profile identifier.
   * Intended for QR cards, scan deduplication, and future social lookup.
   * Null until explicitly provisioned — do not substitute internalAuthUserId.
   */
  publicProfileId?: string | null;
  /**
   * Local photo URI — set from the device photo library via expo-image-picker.
   * Persisted in AsyncStorage. Not synced to the backend.
   */
  photoUri?: string | null;
};

export type MeProfileUpdate = {
  displayName: string;
  handle: string;
  avatarSeed: string;
  showBaobabCode?: boolean;
};

// Progressive private signals are local-only refinements of the base pillars.
// They are stored device-only, keyed by the local relation.id, and are NEVER
// included in any Supabase payload (finalRatings stays a 5-pillar Record).
// Future versions may use them to feed a capped "pillar confidence bonus".
// Types live in lib/progressive-criteria.ts (single source of truth).

type StoreState = {
  me: MeProfile;
  relations: Relation[];
  evaluations: Evaluation[];
  places: Place[];
  progressivePrivateSignals: ProgressivePrivateSignalsByRelation;
};

export type RelationshipSideKey = 'sideA' | 'sideB';

export type RelationUpdate = {
  name: string;
  handle?: string;
  avatarSeed?: string;
};

function applyNormalizedRelationModel(relation: Relation): Relation {
  return {
    ...relation,
    ...normalizeRelationModelFields(relation),
  };
}

function buildEvaluation(
  id: string,
  relationId: string,
  ratings: Record<PillarKey, PillarRating>,
  createdAt: string,
): Evaluation {
  const score = computePrivateLinkScore(ratings);
  return { id, relationId, ratings, score, tier: getTier(score), createdAt };
}

const SEED_RELATIONS: Relation[] = [
  // id:1 — has own reading, sideB absent → status: waiting_other_side (label: Waiting)
  {
    id: '1',
    name: 'Olivier',
    archived: false,
    createdAt: '2025-11-10T10:00:00Z',
    identityStatus: 'draft',
    relationshipNameRevealed: false,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'draft', hasPrivateReading: true, privateReadingId: 'e1' },
      sideB: { exists: false, identityStatus: 'missing', hasPrivateReading: false },
      revealSnapshot: { status: 'waiting_other_side', revealed: false, relationshipNameRevealed: false },
    },
  },
  // id:2 — no own reading → status: unread (label: Unread), opacity 0.55 in Map
  {
    id: '2',
    name: 'Nora',
    archived: false,
    createdAt: '2025-12-01T14:30:00Z',
    identityStatus: 'draft',
    relationshipNameRevealed: false,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'draft', hasPrivateReading: false },
      sideB: { exists: false, identityStatus: 'missing', hasPrivateReading: false },
      revealSnapshot: { status: 'waiting_other_side', revealed: false, relationshipNameRevealed: false },
    },
  },
  // id:3 — archived → far section in List, excluded from Map
  {
    id: '3',
    name: 'Jean',
    archived: true,
    createdAt: '2025-10-05T09:00:00Z',
    identityStatus: 'draft',
    relationshipNameRevealed: false,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'draft', hasPrivateReading: true, privateReadingId: 'e2' },
      sideB: { exists: false, identityStatus: 'missing', hasPrivateReading: false },
      revealSnapshot: { status: 'waiting_other_side', revealed: false, relationshipNameRevealed: false },
    },
  },
  // id:4 — cooking_reveal in progress → status: cooking (label: Preparing)
  {
    id: '4',
    name: 'Sara',
    archived: false,
    createdAt: '2025-12-10T08:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: false,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e3' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'cooking_reveal', revealed: false, cookingStartedAt: '2026-01-20T10:00:00Z' },
    },
  },
  // id:5 — both sides verified, reveal unlocked → status: ready (label: Ready)
  {
    id: '5',
    name: 'Marc',
    archived: false,
    createdAt: '2025-12-15T11:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: false,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e4' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'reveal_ready', revealed: false, readyAt: '2026-01-22T10:00:00Z' },
    },
  },
  // id:6 — revealed, high score (≥60) → status: revealed_stable (label: Stable), proximity: direct
  {
    id: '6',
    name: 'Lena',
    archived: false,
    createdAt: '2025-11-20T09:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e5' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-10T14:00:00Z', mutualScore: 82 },
    },
  },
  // id:7 — revealed, low score (28) → revealed_to_nurture; via Lena (id:6) — better reached through her
  {
    id: '7',
    name: 'Paul',
    archived: false,
    createdAt: '2025-11-25T15:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    viaRelationId: '6',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e6' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-12T10:00:00Z', mutualScore: 28 },
    },
  },
  // id:8 — revealed, moderate score (62) → revealed_stable; sharedNetwork:4 = moderate gateway
  {
    id: '8',
    name: 'Camille',
    archived: false,
    createdAt: '2025-12-01T10:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e7' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-18T11:00:00Z', mutualScore: 62 },
    },
  },
  // id:9 — revealed, moderate-low score (44) → revealed_stable; sharedNetwork:2 = low gateway
  {
    id: '9',
    name: 'Théo',
    archived: false,
    createdAt: '2025-12-10T14:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e8' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-20T09:00:00Z', mutualScore: 44 },
    },
  },
  // id:10 — revealed, strong score (78) → core orbit, strong quality; sharedNetwork:5 = strong gateway
  {
    id: '10',
    name: 'Sophie',
    archived: false,
    createdAt: '2025-11-15T09:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e9' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-08T10:00:00Z', mutualScore: 78 },
    },
  },
  // id:11 — revealed, moderate score (60) → close orbit, moderate quality; sharedNetwork:4 = strong gateway
  {
    id: '11',
    name: 'Max',
    archived: false,
    createdAt: '2025-12-05T11:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e10' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-14T15:00:00Z', mutualScore: 60 },
    },
  },
  // id:12 — revealed, moderate score (48) → outer orbit, moderate quality; sharedNetwork:3 = moderate gateway
  {
    id: '12',
    name: 'Élise',
    archived: false,
    createdAt: '2025-12-08T14:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e11' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-16T09:00:00Z', mutualScore: 48 },
    },
  },
  // id:13 — revealed, strong score (72) → core orbit, strong quality; sharedNetwork:2 = low gateway (no halo)
  {
    id: '13',
    name: 'Antoine',
    archived: false,
    createdAt: '2025-11-28T10:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e12' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-11T14:00:00Z', mutualScore: 72 },
    },
  },
  // id:14 — revealed, faint score (25) via Camille (id:8) → primarily_via, excluded from canvas
  {
    id: '14',
    name: 'Jade',
    archived: false,
    createdAt: '2025-12-20T09:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    viaRelationId: '8',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e13' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-22T11:00:00Z', mutualScore: 25 },
    },
  },
  // id:15 — revealed, faint score (20) via Sophie (id:10) → primarily_via, excluded from canvas
  {
    id: '15',
    name: 'Hugo',
    archived: false,
    createdAt: '2025-12-22T14:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    viaRelationId: '10',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e14' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-23T10:00:00Z', mutualScore: 20 },
    },
  },
  // ── Through Lena world (id:6) ──────────────────────────────────────────
  // id:16 — faint (22) via Lena → primarily_via; sharedNetwork:4 = moderate gateway
  //         (Nadia herself opens a world — visible as a halo in Through Lena)
  {
    id: '16',
    name: 'Nadia',
    archived: false,
    createdAt: '2025-12-15T09:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    viaRelationId: '6',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e15' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-13T10:00:00Z', mutualScore: 22 },
    },
  },
  // id:17 — faint (18) via Lena → primarily_via
  {
    id: '17',
    name: 'Rémi',
    archived: false,
    createdAt: '2025-12-18T11:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    viaRelationId: '6',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e16' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-15T09:00:00Z', mutualScore: 18 },
    },
  },
  // id:18 — faint (30) via Lena → primarily_via
  {
    id: '18',
    name: 'Fatou',
    archived: false,
    createdAt: '2025-12-20T14:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    viaRelationId: '6',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e17' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-17T11:00:00Z', mutualScore: 30 },
    },
  },
  // ── Through Sophie world (id:10) ───────────────────────────────────────
  // id:19 — faint (25) via Sophie → primarily_via
  {
    id: '19',
    name: 'Karim',
    archived: false,
    createdAt: '2026-01-02T09:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    viaRelationId: '10',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e18' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-24T10:00:00Z', mutualScore: 25 },
    },
  },
  // id:20 — faint (28) via Sophie → primarily_via
  {
    id: '20',
    name: 'Inès',
    archived: false,
    createdAt: '2026-01-03T10:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    viaRelationId: '10',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e19' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-25T09:00:00Z', mutualScore: 28 },
    },
  },
  // ── Through Camille world (id:8) ───────────────────────────────────────
  // id:21 — faint (20) via Camille → primarily_via
  {
    id: '21',
    name: 'Victor',
    archived: false,
    createdAt: '2026-01-05T11:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    viaRelationId: '8',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e20' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-26T10:00:00Z', mutualScore: 20 },
    },
  },
  // ── Through Nadia world (id:16) — second-layer demo ───────────────────
  // Nadia is a moderate gateway (sharedNetwork:4 in e15) — she opens her own world.
  // Tapping Nadia in Through Lena shows her gateway halo; drilling opens Through Nadia.
  // id:22 — faint (21) via Nadia → primarily_via (layer 2)
  {
    id: '22',
    name: 'Amira',
    archived: false,
    createdAt: '2026-01-08T10:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    viaRelationId: '16',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e21' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-28T10:00:00Z', mutualScore: 21 },
    },
  },
  // id:23 — faint (19) via Nadia → primarily_via (layer 2)
  {
    id: '23',
    name: 'Ben',
    archived: false,
    createdAt: '2026-01-09T14:00:00Z',
    identityStatus: 'verified',
    relationshipNameRevealed: true,
    source: 'manual',
    viaRelationId: '16',
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true, privateReadingId: 'e22' },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: true, revealedAt: '2026-01-29T09:00:00Z', mutualScore: 19 },
    },
  },
];

const SEED_EVALUATIONS: Evaluation[] = [
  // Olivier — Anchor score (≥60) → toNurture=false
  buildEvaluation('e1', '1', {
    trust: 4,
    interactions: 4,
    affinity: 3,
    support: 4,
    sharedNetwork: 3,
  }, '2026-01-15T12:00:00Z'),
  // Jean (archived) — Distant score
  buildEvaluation('e2', '3', {
    trust: 2,
    interactions: 1,
    affinity: 2,
    support: 1,
    sharedNetwork: 1,
  }, '2025-12-20T09:00:00Z'),
  // Sara — cooking, has reading → Anchor
  buildEvaluation('e3', '4', {
    trust: 4,
    interactions: 4,
    affinity: 3,
    support: 4,
    sharedNetwork: 3,
  }, '2026-01-20T09:00:00Z'),
  // Marc — reveal_ready, has reading → Anchor
  buildEvaluation('e4', '5', {
    trust: 4,
    interactions: 4,
    affinity: 3,
    support: 4,
    sharedNetwork: 3,
  }, '2026-01-21T09:00:00Z'),
  // Lena — revealed, high score → toNurture=false → revealed_stable; sharedNetwork:5 = strong gateway (demo)
  buildEvaluation('e5', '6', {
    trust: 4,
    interactions: 4,
    affinity: 4,
    support: 4,
    sharedNetwork: 5,
  }, '2026-01-10T12:00:00Z'),
  // Paul — revealed, score=0 → toNurture=true → revealed_to_nurture; sharedNetwork:1 = low gateway
  buildEvaluation('e6', '7', {
    trust: 1,
    interactions: 1,
    affinity: 1,
    support: 1,
    sharedNetwork: 1,
  }, '2026-01-12T09:00:00Z'),
  // Camille — revealed, mutualScore:62 → moderate quality; sharedNetwork:4 = moderate gateway
  buildEvaluation('e7', '8', {
    trust: 4,
    interactions: 3,
    affinity: 4,
    support: 3,
    sharedNetwork: 4,
  }, '2026-01-18T10:00:00Z'),
  // Théo — revealed, mutualScore:44 → moderate quality; sharedNetwork:2 = low gateway
  buildEvaluation('e8', '9', {
    trust: 3,
    interactions: 2,
    affinity: 3,
    support: 2,
    sharedNetwork: 2,
  }, '2026-01-20T08:00:00Z'),
  // Sophie — revealed, mutualScore:78 → strong quality; sharedNetwork:5 = strong gateway
  buildEvaluation('e9', '10', {
    trust: 5,
    interactions: 4,
    affinity: 4,
    support: 4,
    sharedNetwork: 5,
  }, '2026-01-08T09:00:00Z'),
  // Max — revealed, mutualScore:60 → moderate quality; sharedNetwork:4 = strong gateway
  buildEvaluation('e10', '11', {
    trust: 4,
    interactions: 3,
    affinity: 4,
    support: 3,
    sharedNetwork: 4,
  }, '2026-01-14T14:00:00Z'),
  // Élise — revealed, mutualScore:48 → moderate quality; sharedNetwork:3 = moderate gateway
  buildEvaluation('e11', '12', {
    trust: 3,
    interactions: 3,
    affinity: 3,
    support: 3,
    sharedNetwork: 3,
  }, '2026-01-16T08:00:00Z'),
  // Antoine — revealed, mutualScore:72 → strong quality; sharedNetwork:2 = low gateway
  buildEvaluation('e12', '13', {
    trust: 4,
    interactions: 4,
    affinity: 4,
    support: 3,
    sharedNetwork: 2,
  }, '2026-01-11T13:00:00Z'),
  // Jade — primarily_via (via Camille), faint; sharedNetwork:1 = low gateway
  buildEvaluation('e13', '14', {
    trust: 2,
    interactions: 1,
    affinity: 2,
    support: 1,
    sharedNetwork: 1,
  }, '2026-01-22T10:00:00Z'),
  // Hugo — primarily_via (via Sophie), faint; sharedNetwork:1 = low gateway
  buildEvaluation('e14', '15', {
    trust: 1,
    interactions: 2,
    affinity: 2,
    support: 1,
    sharedNetwork: 1,
  }, '2026-01-23T09:00:00Z'),
  // Nadia — primarily_via (via Lena), faint direct link; sharedNetwork:4 = moderate gateway
  // This makes her a world_opener in Through Lena (halo) and enables Through Nadia (layer 2)
  buildEvaluation('e15', '16', {
    trust: 2,
    interactions: 2,
    affinity: 2,
    support: 1,
    sharedNetwork: 4,
  }, '2026-01-13T09:00:00Z'),
  // Rémi — primarily_via (via Lena), faint
  buildEvaluation('e16', '17', {
    trust: 1,
    interactions: 2,
    affinity: 2,
    support: 1,
    sharedNetwork: 1,
  }, '2026-01-15T08:00:00Z'),
  // Fatou — primarily_via (via Lena), faint
  buildEvaluation('e17', '18', {
    trust: 2,
    interactions: 2,
    affinity: 2,
    support: 2,
    sharedNetwork: 1,
  }, '2026-01-17T10:00:00Z'),
  // Karim — primarily_via (via Sophie), faint
  buildEvaluation('e18', '19', {
    trust: 2,
    interactions: 1,
    affinity: 2,
    support: 1,
    sharedNetwork: 1,
  }, '2026-01-24T09:00:00Z'),
  // Inès — primarily_via (via Sophie), faint
  buildEvaluation('e19', '20', {
    trust: 2,
    interactions: 2,
    affinity: 2,
    support: 1,
    sharedNetwork: 1,
  }, '2026-01-25T08:00:00Z'),
  // Victor — primarily_via (via Camille), faint
  buildEvaluation('e20', '21', {
    trust: 1,
    interactions: 2,
    affinity: 2,
    support: 1,
    sharedNetwork: 1,
  }, '2026-01-26T09:00:00Z'),
  // Amira — primarily_via (via Nadia), faint — layer 2 demo
  buildEvaluation('e21', '22', {
    trust: 2,
    interactions: 1,
    affinity: 2,
    support: 1,
    sharedNetwork: 1,
  }, '2026-01-28T09:00:00Z'),
  // Ben — primarily_via (via Nadia), faint — layer 2 demo
  buildEvaluation('e22', '23', {
    trust: 1,
    interactions: 2,
    affinity: 2,
    support: 1,
    sharedNetwork: 1,
  }, '2026-01-29T08:00:00Z'),
];

const SEED_ME: MeProfile = {
  id: 'me-local-001',
  displayName: 'Yasmine',
  handle: '@yasmine.baobab',
  avatarSeed: 'Y',
  showBaobabCode: true,
  // Dev seed is always "set up" so the edit redirect doesn't interrupt dev/demo workflows.
  // Production first-run starts with false — forces the name setup step.
  isProfileSetup: __DEV__,
  internalAuthUserId: null,
  publicProfileId: null,
  photoUri: null,
};

const SEED_PLACES: Place[] = [
  // Via route '6' — cafe × 2 kept → keptCount 2 → strength 'strong' in territory derivation
  { id: 'seed-place-1', name: 'Café Orée', category: 'cafe', personalFit: 'kept', impression: 'Quiet corner, easy to stay.', createdAt: '2026-02-10T10:00:00Z', sourceRelationId: '6' },
  { id: 'seed-place-2', name: 'Le Comptoir Calme', category: 'cafe', personalFit: 'kept', impression: 'Good light, no noise.', createdAt: '2026-03-05T09:30:00Z', sourceRelationId: '6' },
  // Via route '6' — cafe tried → exercises triedCount; no signal alone
  { id: 'seed-place-3', name: 'Passage Verde', category: 'cafe', personalFit: 'tried', createdAt: '2026-03-18T14:00:00Z', sourceRelationId: '6' },
  // Via route '6' — restaurant × 1 kept → strength 'observed'
  { id: 'seed-place-4', name: 'Maison Luma', category: 'restaurant', personalFit: 'kept', impression: 'Warm dinner spot with a calm rhythm.', createdAt: '2026-01-28T20:00:00Z', sourceRelationId: '6' },
  // Via route '10' — spot × 1 kept → strength 'observed'
  { id: 'seed-place-5', name: 'Jardin Haut', category: 'spot', personalFit: 'kept', impression: 'Open-air place that felt easy to return to.', createdAt: '2026-02-20T16:00:00Z', sourceRelationId: '10' },
  // Via route '10' — restaurant × 1 kept → second observed signal for restaurant territory
  { id: 'seed-place-6', name: 'Atelier Nord', category: 'restaurant', personalFit: 'kept', impression: 'Simple menu, strong sense of place.', createdAt: '2026-04-02T19:30:00Z', sourceRelationId: '10' },
  // No sourceRelationId — bar kept → confirms exclusion from territory derivation
  { id: 'seed-place-7', name: 'Le Fond du Couloir', category: 'bar', personalFit: 'kept', impression: 'Found on my own. Good enough to return.', createdAt: '2026-01-15T22:00:00Z' },
  // Via route '6' — saved → excluded from signal derivation (no territory proof)
  { id: 'seed-place-8', name: 'Rue Basse', category: 'bar', personalFit: 'saved', createdAt: '2026-04-10T11:00:00Z', sourceRelationId: '6' },
];
const PLACE_CATEGORIES: PlaceCategory[] = ['restaurant', 'cafe', 'bar', 'spot', 'other'];
const REVEAL_UNLOCK_DELAY_MS = 90_000;

/**
 * Bump when SEED_RELATIONS, SEED_EVALUATIONS, or SEED_PLACES change meaningfully.
 * On mismatch with persisted state, the store resets to fresh seed.
 * This ensures dev/demo devices always get the latest data.
 */
const SEED_VERSION = 7;

type PersistedState = StoreState & { seedVersion?: number };

// ── state ──────────────────────────────────────────────────────────────

const state: StoreState = {
  me: SEED_ME,
  // Seed data is dev-only — production first-run must start with an empty world.
  relations: __DEV__ ? SEED_RELATIONS.map(applyNormalizedRelationModel) : [],
  evaluations: __DEV__ ? SEED_EVALUATIONS : [],
  places: __DEV__ ? SEED_PLACES : [],
  progressivePrivateSignals: {},
};

let hydrated = false;

// ── pub/sub ────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── snapshots ──────────────────────────────────────────────────────────

function getRelationsSnapshot() {
  return state.relations;
}

function getMeSnapshot() {
  return state.me;
}

function getEvaluationsSnapshot() {
  return state.evaluations;
}

function getPlacesSnapshot() {
  return state.places;
}

function getProgressivePrivateSignalsSnapshot() {
  return state.progressivePrivateSignals;
}

function getHydratedSnapshot() {
  return hydrated;
}

function sanitizePlaceCategory(value: unknown): PlaceCategory {
  if (typeof value === 'string' && PLACE_CATEGORIES.includes(value as PlaceCategory)) {
    return value as PlaceCategory;
  }
  return 'other';
}

const PLACE_PERSONAL_FITS: PlacePersonalFit[] = ['saved', 'tried', 'kept', 'not_for_me'];

function sanitizePlacePersonalFit(value: unknown): PlacePersonalFit {
  if (typeof value === 'string' && PLACE_PERSONAL_FITS.includes(value as PlacePersonalFit)) {
    return value as PlacePersonalFit;
  }
  // Legacy hydration: numeric rating → personalFit
  if (typeof value === 'number') {
    if (value >= 4) return 'kept';
    if (value === 3) return 'tried';
    return 'not_for_me';
  }
  return 'saved';
}

function sanitizePlaceSourceRelationId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSideIdentityStatus(
  value: unknown,
  fallback: RelationshipSideIdentityStatus,
): RelationshipSideIdentityStatus {
  if (value === 'verified' || value === 'draft' || value === 'missing') return value;
  return fallback;
}

function getLatestEvaluationForRelation(
  evaluations: Evaluation[],
  relationId: string,
): Evaluation | null {
  let latest: Evaluation | null = null;
  for (const evaluation of evaluations) {
    if (evaluation.relationId !== relationId) continue;
    if (!latest || evaluation.createdAt > latest.createdAt) {
      latest = evaluation;
    }
  }
  return latest;
}

function buildDefaultRelationshipLocalState(
  relation: Pick<Relation, 'id' | 'identityStatus' | 'relationshipNameRevealed'>,
  evaluations: Evaluation[],
): RelationshipLocalState {
  const latestEvaluation = getLatestEvaluationForRelation(evaluations, relation.id);

  return {
    sideA: {
      exists: true,
      identityStatus: relation.identityStatus,
      hasPrivateReading: Boolean(latestEvaluation),
      privateReadingId: latestEvaluation?.id,
    },
    sideB: {
      exists: false,
      identityStatus: 'missing',
      hasPrivateReading: false,
      privateReadingId: undefined,
    },
    revealSnapshot: {
      status: 'waiting_other_side',
      revealed: relation.relationshipNameRevealed === true,
      relationshipNameRevealed: relation.relationshipNameRevealed === true,
    },
  };
}

function isRevealStatus(value: unknown): value is RelationshipRevealSnapshot['status'] {
  return (
    value === 'waiting_other_side' ||
    value === 'cooking_reveal' ||
    value === 'reveal_ready' ||
    value === 'revealed'
  );
}

function deriveRevealStatus({
  revealed,
  sideAHasReading,
  sideBHasReading,
}: {
  revealed: boolean;
  sideAHasReading: boolean;
  sideBHasReading: boolean;
}): RelationshipRevealSnapshot['status'] {
  if (revealed) return 'revealed';
  if (sideAHasReading && sideBHasReading) return 'reveal_ready';
  return 'waiting_other_side';
}

function isStatusRevealed(status: RelationshipRevealSnapshot['status']): boolean {
  return status === 'revealed';
}

function normalizeRelationshipLocalState(
  relation: Pick<Relation, 'id' | 'identityStatus' | 'relationshipNameRevealed'> & {
    localState?: Partial<RelationshipLocalState> | null;
  },
  evaluations: Evaluation[],
): RelationshipLocalState {
  const fallback = buildDefaultRelationshipLocalState(relation, evaluations);
  const raw = relation.localState;
  if (!raw) return fallback;

  const rawSideB = raw.sideB;
  const sideBExists = rawSideB?.exists === true;
  const sideBReadingId =
    typeof rawSideB?.privateReadingId === 'string' && rawSideB.privateReadingId.length > 0
      ? rawSideB.privateReadingId
      : undefined;
  const sideBTierStatus = sideBExists
    ? normalizeSideIdentityStatus(rawSideB?.identityStatus, 'missing')
    : 'missing';
  const sideBHasReading = sideBExists && (rawSideB?.hasPrivateReading === true || Boolean(sideBReadingId));
  const sideBResolvedAt =
    sideBExists && typeof rawSideB?.resolvedAt === 'string' && rawSideB.resolvedAt.length > 0
      ? rawSideB.resolvedAt
      : undefined;

  const rawReveal = raw.revealSnapshot;
  const statusCandidate = isRevealStatus(rawReveal?.status)
    ? rawReveal.status
    : deriveRevealStatus({
        revealed: relation.relationshipNameRevealed === true || rawReveal?.revealed === true,
        sideAHasReading: fallback.sideA.hasPrivateReading,
        sideBHasReading,
      });
  const forceRevealed =
    relation.relationshipNameRevealed === true || rawReveal?.revealed === true;
  const revealStatus = forceRevealed ? 'revealed' : statusCandidate;
  const revealed = isStatusRevealed(revealStatus);
  // Re-derive the snapshot tier from mutualScore when available, falling
  // back to a whitelisted rawTier otherwise. Defensive against legacy
  // persisted labels (pre Sprint V.1) surviving in AsyncStorage.
  const tier = normalizePersistedRevealSnapshotTier(rawReveal?.tier, rawReveal?.mutualScore);

  // sideA: derive from local evaluations (fallback), but upgrade hasPrivateReading if the
  // persisted raw state carries backend truth (bootstrap/claim sources).
  // This prevents silent downgrade of sideA.hasPrivateReading on re-hydration for
  // relations where the reading truth comes from the backend, not a local evaluation.
  // INVARIANT: only upgrades (false → true), never downgrades (true → false).
  const rawSideA = raw.sideA;
  const sideAHasReadingFromBackend = rawSideA?.hasPrivateReading === true;

  return {
    sideA: {
      ...fallback.sideA,
      hasPrivateReading: fallback.sideA.hasPrivateReading || sideAHasReadingFromBackend,
    },
    sideB: {
      exists: sideBExists,
      identityStatus: sideBTierStatus,
      hasPrivateReading: sideBHasReading,
      privateReadingId: sideBHasReading ? sideBReadingId : undefined,
      resolvedAt: sideBResolvedAt,
    },
    revealSnapshot: {
      status: revealStatus,
      revealed,
      cookingStartedAt:
        typeof rawReveal?.cookingStartedAt === 'string' && rawReveal.cookingStartedAt.length > 0
          ? rawReveal.cookingStartedAt
          : undefined,
      unlockAt:
        typeof rawReveal?.unlockAt === 'string' && rawReveal.unlockAt.length > 0
          ? rawReveal.unlockAt
          : undefined,
      readyAt:
        typeof rawReveal?.readyAt === 'string' && rawReveal.readyAt.length > 0
          ? rawReveal.readyAt
          : undefined,
      firstViewedAt:
        typeof rawReveal?.firstViewedAt === 'string' && rawReveal.firstViewedAt.length > 0
          ? rawReveal.firstViewedAt
          : undefined,
      revealedAt:
        isStatusRevealed(revealStatus) &&
        typeof rawReveal?.revealedAt === 'string' &&
        rawReveal.revealedAt.length > 0
          ? rawReveal.revealedAt
          : undefined,
      mutualScore:
        isStatusRevealed(revealStatus) && typeof rawReveal?.mutualScore === 'number'
          ? rawReveal.mutualScore
          : undefined,
      tier: isStatusRevealed(revealStatus) ? tier : undefined,
      relationshipNameRevealed: isStatusRevealed(revealStatus),
      finalizedVersion:
        typeof rawReveal?.finalizedVersion === 'number' && Number.isFinite(rawReveal.finalizedVersion)
          ? rawReveal.finalizedVersion
          : undefined,
    },
  };
}

// ── persistence ────────────────────────────────────────────────────────

function persist() {
  if (!hydrated) return;
  // internalAuthUserId and publicProfileId are runtime fields — not persisted.
  // internalAuthUserId is always re-derived from the live Supabase session on bootstrap.
  // publicProfileId will be provisioned from the backend, not from AsyncStorage.
  // Using undefined so JSON.stringify omits these keys entirely.
  const { internalAuthUserId: _a, publicProfileId: _b, ...persistableMe } = state.me;
  persistState<PersistedState>({
    me: persistableMe as MeProfile,
    relations: state.relations,
    evaluations: state.evaluations,
    places: state.places,
    progressivePrivateSignals: state.progressivePrivateSignals,
    seedVersion: SEED_VERSION,
  });
}

// ── hydration (runs once at import time) ───────────────────────────────

loadPersistedState<PersistedState>().then((persisted) => {
  if (
    persisted &&
    Array.isArray(persisted.relations) &&
    Array.isArray(persisted.evaluations) &&
    persisted.seedVersion === SEED_VERSION
  ) {
    const persistedEvaluations = persisted.evaluations;
    if (persisted.me) {
      state.me = {
        ...SEED_ME,
        ...persisted.me,
        id: persisted.me.id ?? SEED_ME.id,
        // Back-compat: isProfileSetup was added in SEED_VERSION 6.
        // If not persisted (older install), infer from having a non-seed identity.
        isProfileSetup: persisted.me.isProfileSetup ??
          (persisted.me.displayName !== SEED_ME.displayName ||
           persisted.me.handle !== SEED_ME.handle),
        // Runtime fields are never read from AsyncStorage — always re-derived at runtime.
        // Preserve any value already set from onAuthStateChange firing before this
        // hydration completes (race condition: auth can resolve before AsyncStorage).
        internalAuthUserId: state.me.internalAuthUserId ?? null,
        publicProfileId: state.me.publicProfileId ?? null,
      };
    }
    state.relations = persisted.relations.map((relation) =>
      applyNormalizedRelationModel({
        ...relation,
        avatarSeed:
          relation.avatarSeed ||
          relation.name?.trim().charAt(0).toUpperCase() ||
          '?',
        source:
          relation.source === 'scan' ? 'scan' :
          relation.source === 'claim' ? 'claim' :
          relation.source === 'bootstrap' ? 'bootstrap' :
          relation.source === 'invite_number' ? 'invite_number' :
          'manual',
        identityStatus:
          relation.identityStatus === 'verified' ||
          relation.source === 'scan' ||
          relation.source === 'claim' ||
          relation.source === 'bootstrap'
            ? 'verified'
            : 'draft',
        relationshipNameRevealed: relation.relationshipNameRevealed === true,
        localState: normalizeRelationshipLocalState({
          id: relation.id,
          identityStatus:
            relation.identityStatus === 'verified' ||
            relation.source === 'scan' ||
            relation.source === 'claim' ||
            relation.source === 'bootstrap'
              ? 'verified'
              : 'draft',
          relationshipNameRevealed: relation.relationshipNameRevealed === true,
          localState: relation.localState,
        }, persistedEvaluations),
        ...(() => {
          const w = sanitizeRelationOpenWorlds((relation as Record<string, unknown>).privateOpenWorlds);
          return w.length > 0 ? { privateOpenWorlds: w } : {};
        })(),
      }),
    );
    // Re-derive tier on every persisted evaluation. Defensive against legacy
    // persisted labels (pre Sprint V.1: Ghost / Spark / Thrill / Vibrant /
    // Legend) surviving in AsyncStorage from older installs. The score is
    // the canonical truth; the tier label is a pure derivation via getTier.
    state.evaluations = persistedEvaluations.map(normalizePersistedEvaluationTier);
    state.places = Array.isArray(persisted.places)
      ? persisted.places.reduce<Place[]>((acc, rawPlace) => {
          if (!rawPlace || typeof rawPlace !== 'object') return acc;
          const place = rawPlace as Partial<Place>;
          const name = typeof place.name === 'string' ? place.name.trim() : '';
          if (!name) return acc;

          const hydratedSourceRelationId = sanitizePlaceSourceRelationId(
            (place as Record<string, unknown>).sourceRelationId,
          );
          acc.push({
            id:
              typeof place.id === 'string' && place.id.length > 0
                ? place.id
                : `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            category: sanitizePlaceCategory(place.category),
            personalFit: sanitizePlacePersonalFit(
              (place as Record<string, unknown>).personalFit ??
              (place as Record<string, unknown>).rating,
            ),
            impression:
              typeof place.impression === 'string' && place.impression.trim().length > 0
                ? place.impression.trim()
                : undefined,
            createdAt:
              typeof place.createdAt === 'string' && place.createdAt.length > 0
                ? place.createdAt
                : new Date().toISOString(),
            ...(hydratedSourceRelationId !== undefined ? { sourceRelationId: hydratedSourceRelationId } : {}),
          });

          return acc;
        }, [])
      : [];
    // Progressive private signals: load if present, else keep empty.
    // No schema validation here — the writer is the only entry point and
    // is type-safe. Older installs simply start with an empty map.
    if (
      persisted.progressivePrivateSignals &&
      typeof persisted.progressivePrivateSignals === 'object' &&
      !Array.isArray(persisted.progressivePrivateSignals)
    ) {
      state.progressivePrivateSignals = persisted.progressivePrivateSignals;
    }
  } else {
    // No persisted state, or stale seed version — reset to fresh seed.
    persistState<PersistedState>({
      me: state.me,
      relations: state.relations,
      evaluations: state.evaluations,
      places: state.places,
      progressivePrivateSignals: state.progressivePrivateSignals,
      seedVersion: SEED_VERSION,
    });
  }
  hydrated = true;
  emitChange();
});

// ── mutations ──────────────────────────────────────────────────────────

/**
 * Provisions or clears the internal auth identity in the local profile.
 *
 * Call this at two points:
 *   1. App bootstrap — when the existing session is resolved via getCurrentAuthenticatedUser()
 *   2. Every auth state change — via supabase.auth.onAuthStateChange()
 *
 * Pass null to clear (sign-out, unauthenticated state).
 *
 * This function does NOT call persist() — internalAuthUserId is a runtime field
 * that is always re-derived from the live session, never read from AsyncStorage.
 */
function hydrateAuthIdentity(userId: string | null): void {
  if (state.me.internalAuthUserId === userId) return;
  state.me = { ...state.me, internalAuthUserId: userId };
  emitChange();
}

/**
 * Provisions or clears the public profile identity in the local profile.
 *
 * Call this once the backend provisioning flow for publicProfileId is implemented.
 * Until then, publicProfileId remains null and QR cards are emitted as v1.
 *
 * INVARIANT: never pass internalAuthUserId here. publicProfileId must be a
 * distinct identifier provisioned by the backend — not derived from auth.uid().
 *
 * This function does NOT call persist() — publicProfileId is a runtime field
 * provisioned from the backend on demand, not stored in AsyncStorage.
 */
function hydratePublicProfileId(id: string | null): void {
  if (state.me.publicProfileId === id) return;
  state.me = { ...state.me, publicProfileId: id };
  emitChange();
}

function setArchived(id: string, archived: boolean) {
  state.relations = state.relations.map((relation) =>
    relation.id === id ? { ...relation, archived } : relation,
  );
  emitChange();
  persist();
}

function setPrivateReadingOnSide(
  relation: Relation,
  side: RelationshipSideKey,
  evaluationId: string,
): Relation {
  const localState = relation.localState ?? buildDefaultRelationshipLocalState(relation, state.evaluations);

  if (side === 'sideA') {
    return applyNormalizedRelationModel({
      ...relation,
      localState: {
        ...localState,
        sideA: {
          ...localState.sideA,
          exists: true,
          identityStatus: relation.identityStatus,
          hasPrivateReading: true,
          privateReadingId: evaluationId,
        },
      },
    });
  }

  if (!localState.sideB.exists) {
    return relation;
  }

  return applyNormalizedRelationModel({
    ...relation,
    localState: {
      ...localState,
      sideB: {
        ...localState.sideB,
        hasPrivateReading: true,
        privateReadingId: evaluationId,
      },
    },
  });
}

function finalizeCookingStartInState(relationId: string): boolean {
  const relation = state.relations.find((item) => item.id === relationId);
  if (!relation) return false;

  const localState = relation.localState ?? buildDefaultRelationshipLocalState(relation, state.evaluations);
  const snapshot = localState.revealSnapshot;
  if (snapshot.status === 'cooking_reveal' || snapshot.status === 'reveal_ready' || snapshot.status === 'revealed') {
    return false;
  }
  if (!localState.sideA.exists || !localState.sideB.exists) return false;
  if (!localState.sideA.hasPrivateReading || !localState.sideB.hasPrivateReading) return false;

  const readingAId = localState.sideA.privateReadingId;
  const readingBId = localState.sideB.privateReadingId;
  if (!readingAId || !readingBId) return false;

  const readingA = state.evaluations.find((item) => item.id === readingAId);
  const readingB = state.evaluations.find((item) => item.id === readingBId);
  if (!readingA || !readingB) return false;
  // Both sides pointing to the same evaluation means sideB's eval leaked into the sideA
  // slot via buildDefaultRelationshipLocalState (happens for claim-source relations where
  // sideA has no local evaluation). A mutual score computed from identical ratings is invalid.
  if (readingA.id === readingB.id) return false;

  const mutual = computeMutualRelationshipScore(readingA.ratings, readingB.ratings);
  const cookingStartedAt = new Date().toISOString();
  const unlockAt = new Date(Date.now() + REVEAL_UNLOCK_DELAY_MS).toISOString();

  state.relations = state.relations.map((item) => {
    if (item.id !== relationId) return item;
    const current = item.localState ?? buildDefaultRelationshipLocalState(item, state.evaluations);
    return applyNormalizedRelationModel({
      ...item,
      relationshipNameRevealed: false,
      localState: {
        ...current,
        revealSnapshot: {
          ...current.revealSnapshot,
          status: 'cooking_reveal',
          revealed: false,
          relationshipNameRevealed: false,
          cookingStartedAt,
          unlockAt,
          readyAt: undefined,
          firstViewedAt: undefined,
          revealedAt: undefined,
          mutualScore: mutual.finalScore,
          tier: mutual.tier,
          finalizedVersion: (current.revealSnapshot.finalizedVersion ?? 0) + 1,
        },
      },
    });
  });

  return true;
}

function markRevealReadyIfUnlockedInState(relationId: string): boolean {
  const relation = state.relations.find((item) => item.id === relationId);
  if (!relation) return false;

  const snapshot = relation.localState.revealSnapshot;
  if (snapshot.status !== 'cooking_reveal') return false;
  if (!snapshot.unlockAt) return false;

  const unlockAtMs = Date.parse(snapshot.unlockAt);
  if (!Number.isFinite(unlockAtMs) || Date.now() < unlockAtMs) return false;

  const now = new Date().toISOString();
  state.relations = state.relations.map((item) => {
    if (item.id !== relationId) return item;
    return applyNormalizedRelationModel({
      ...item,
      localState: {
        ...item.localState,
        revealSnapshot: {
          ...item.localState.revealSnapshot,
          status: 'reveal_ready',
          readyAt: item.localState.revealSnapshot.readyAt ?? now,
          revealed: false,
          relationshipNameRevealed: false,
        },
      },
    });
  });

  return true;
}

function openMutualRevealInState(relationId: string): boolean {
  const movedToReady = markRevealReadyIfUnlockedInState(relationId);
  const relation = state.relations.find((item) => item.id === relationId);
  if (!relation) return false;

  const snapshot = relation.localState.revealSnapshot;
  if (snapshot.status === 'revealed') return movedToReady;
  if (snapshot.status !== 'reveal_ready') return movedToReady;

  const now = new Date().toISOString();
  state.relations = state.relations.map((item) => {
    if (item.id !== relationId) return item;
    return applyNormalizedRelationModel({
      ...item,
      relationshipNameRevealed: true,
      localState: {
        ...item.localState,
        revealSnapshot: {
          ...item.localState.revealSnapshot,
          status: 'revealed',
          revealed: true,
          relationshipNameRevealed: true,
          firstViewedAt: item.localState.revealSnapshot.firstViewedAt ?? now,
          revealedAt: now,
        },
      },
    });
  });

  return true;
}

function pushEvaluationForSide(
  evaluation: Evaluation,
  side: RelationshipSideKey,
): boolean {
  const relation = state.relations.find((item) => item.id === evaluation.relationId);
  if (!relation) return false;

  const localState = relation.localState ?? buildDefaultRelationshipLocalState(relation, state.evaluations);
  if (side === 'sideB' && !localState.sideB.exists) return false;

  state.evaluations = [...state.evaluations, evaluation];
  state.relations = state.relations.map((relation) => {
    if (relation.id !== evaluation.relationId) return relation;
    return setPrivateReadingOnSide(relation, side, evaluation.id);
  });
  finalizeCookingStartInState(evaluation.relationId);
  emitChange();
  persist();
  return true;
}

function pushEvaluation(evaluation: Evaluation) {
  return pushEvaluationForSide(evaluation, 'sideA');
}

function resolveInviteSideB(relationId: string): boolean {
  const meHasIdentity = Boolean(state.me.displayName.trim() && state.me.handle.trim());
  if (!meHasIdentity) return false;

  let didResolve = false;
  state.relations = state.relations.map((relation) => {
    if (relation.id !== relationId) return relation;

    const localState = relation.localState ?? buildDefaultRelationshipLocalState(relation, state.evaluations);
    const alreadyResolved =
      localState.sideB.exists &&
      localState.sideB.identityStatus !== 'missing';
    if (alreadyResolved) return relation;

    const sideBIdentityStatus =
      localState.sideB.identityStatus === 'verified'
        ? 'verified'
        : 'draft';

    didResolve = true;
    return applyNormalizedRelationModel({
      ...relation,
      localState: {
        ...localState,
        sideB: {
          ...localState.sideB,
          exists: true,
          identityStatus: sideBIdentityStatus,
          hasPrivateReading: localState.sideB.hasPrivateReading,
          privateReadingId: localState.sideB.privateReadingId,
          resolvedAt: localState.sideB.resolvedAt ?? new Date().toISOString(),
        },
      },
    });
  });

  if (!didResolve) return false;
  emitChange();
  persist();
  return true;
}

function finalizeCookingStart(relationId: string): boolean {
  const changed = finalizeCookingStartInState(relationId);
  if (!changed) return false;
  emitChange();
  persist();
  return true;
}

function markRevealReadyIfUnlocked(relationId: string): boolean {
  const changed = markRevealReadyIfUnlockedInState(relationId);
  if (!changed) return false;
  emitChange();
  persist();
  return true;
}

function openMutualReveal(relationId: string): boolean {
  const changed = openMutualRevealInState(relationId);
  if (!changed) return false;
  emitChange();
  persist();
  return true;
}

export type PlaceCreateInput = {
  name: string;
  category: PlaceCategory;
  personalFit: PlacePersonalFit;
  impression?: string;
  sourceRelationId?: string;
};

export type PlaceUpdateInput = {
  name: string;
  category: PlaceCategory;
  personalFit: PlacePersonalFit;
  impression?: string;
};

// ── progressive private signals ────────────────────────────────────────
// Local-only refinements per relation. Persisted in AsyncStorage via the
// global persist(). NEVER serialized into any Supabase payload — the
// computePrivateLinkScore / mutual reveal flow does not read this map.

function writeProgressivePrivateSignal(
  relationId: string,
  pillarKey: PillarKey,
  criterionKey: ProgressiveCriterionKey,
  rating: 1 | 2 | 3 | 4 | 5,
): void {
  const next = applyProgressivePrivateSignal(
    state.progressivePrivateSignals,
    relationId,
    pillarKey,
    criterionKey,
    rating,
  );
  if (next === state.progressivePrivateSignals) return;
  state.progressivePrivateSignals = next;
  persist();
  emitChange();
}

function pushPlace(input: PlaceCreateInput): Place | null {
  const cleanName = input.name.trim();
  if (!cleanName) return null;

  const category = sanitizePlaceCategory(input.category);
  const personalFit = sanitizePlacePersonalFit(input.personalFit);
  const cleanImpression = input.impression?.trim();
  const sourceRelationId = sanitizePlaceSourceRelationId(input.sourceRelationId);
  const place: Place = {
    id: `p-${Date.now()}`,
    name: cleanName,
    category,
    personalFit,
    impression: cleanImpression ? cleanImpression : undefined,
    createdAt: new Date().toISOString(),
    ...(sourceRelationId !== undefined ? { sourceRelationId } : {}),
  };
  state.places = [place, ...state.places];
  emitChange();
  persist();
  return place;
}

function setPlace(id: string, update: PlaceUpdateInput): boolean {
  const cleanName = update.name.trim();
  if (!cleanName) return false;

  const category = sanitizePlaceCategory(update.category);
  const personalFit = sanitizePlacePersonalFit(update.personalFit);
  const cleanImpression = update.impression?.trim();

  let didUpdate = false;
  state.places = state.places.map((place) => {
    if (place.id !== id) return place;
    didUpdate = true;
    return {
      ...place,
      name: cleanName,
      category,
      personalFit,
      impression: cleanImpression ? cleanImpression : undefined,
    };
  });

  if (!didUpdate) return false;
  emitChange();
  persist();
  return true;
}

function updateRelationPrivateOpenWorlds(id: string, worlds: RelationOpenWorld[]): boolean {
  const sanitized = sanitizeRelationOpenWorlds(worlds);
  let didUpdate = false;
  state.relations = state.relations.map((relation) => {
    if (relation.id !== id) return relation;
    didUpdate = true;
    return {
      ...relation,
      privateOpenWorlds: sanitized.length > 0 ? sanitized : undefined,
    };
  });
  if (!didUpdate) return false;
  emitChange();
  persist();
  return true;
}

function pushRelation(name: string): Relation | null {
  const cleanName = name.trim();
  if (!cleanName) return null;

  const relation = applyNormalizedRelationModel({
    id: `r-${Date.now()}`,
    name: cleanName,
    archived: false,
    createdAt: new Date().toISOString(),
    identityStatus: 'draft',
    relationshipNameRevealed: false,
    avatarSeed: cleanName.charAt(0).toUpperCase() || '?',
    privateLabel: cleanName,
    anchorMode: 'manual',
    anchorValue: null,
    relationDepth: 'encounter',
    source: 'manual',
    localState: {
      sideA: {
        exists: true,
        identityStatus: 'draft',
        hasPrivateReading: false,
      },
      sideB: {
        exists: false,
        identityStatus: 'missing',
        hasPrivateReading: false,
      },
      revealSnapshot: {
        status: 'waiting_other_side',
        revealed: false,
        relationshipNameRevealed: false,
      },
    },
  });
  state.relations = [relation, ...state.relations];
  emitChange();
  persist();
  return relation;
}

type RelationSourceMeta = {
  source: 'manual' | 'scan' | 'claim' | 'invite_number';
  privateLabel?: string;
  anchorMode?: RelationAnchorMode;
  handle?: string;
  avatarSeed?: string;
  sourceCardMeId?: string;
  sourcePublicProfileId?: string;
  sourceHandle?: string;
  anchorValue?: string | null;
  relationDepth?: RelationDepth;
  /**
   * For 'claim' source only.
   * The canonical relation UUID from the claim response (claim.relationship_id).
   * Set as Relation.canonicalRelationId at creation time.
   */
  canonicalRelationId?: string;
  /**
   * For 'claim' source only.
   * The full shared_record from the claim response, projected via buildSharedRevealLocalState.
   * When present, provides accurate initial localState instead of the conservative default.
   */
  claimSharedRecord?: SharedRelationBootstrapInput;
};

function pushRelationWithSource(
  name: string,
  meta: RelationSourceMeta,
): Relation | null {
  const cleanName = name.trim();
  if (!cleanName) return null;

  const isClaim = meta.source === 'claim';
  const isVerified = meta.source === 'scan' || isClaim;

  const relation = applyNormalizedRelationModel({
    id: `r-${Date.now()}`,
    name: cleanName,
    archived: false,
    createdAt: new Date().toISOString(),
    identityStatus: isVerified ? 'verified' : 'draft',
    relationshipNameRevealed: false,
    handle: meta.handle,
    avatarSeed: meta.avatarSeed || cleanName.charAt(0).toUpperCase() || '?',
    privateLabel: meta.privateLabel ?? cleanName,
    anchorMode: meta.anchorMode,
    source: meta.source,
    sourceCardMeId: meta.sourceCardMeId,
    sourcePublicProfileId: meta.sourcePublicProfileId,
    sourceHandle: meta.sourceHandle,
    anchorValue: meta.anchorValue ?? null,
    relationDepth: meta.relationDepth,
    // For claim source: canonicalRelationId is known at creation time.
    // For other sources: null (set later via setCanonicalRelationId at invite creation).
    canonicalRelationId: meta.canonicalRelationId ?? null,
    // For claim source only: the counterpart's public profile signal, if available.
    // Null for manual/scan sources (not applicable) and when counterpart hasn't provisioned.
    counterpartPublicProfileId: isClaim
      ? (meta.claimSharedRecord?.counterpart_public_profile_id ?? null)
      : undefined,
    localState: isClaim
      ? meta.claimSharedRecord
        ? buildSharedRevealLocalState(meta.claimSharedRecord)
        : {
            // Conservative default when shared_record was not transported (should not happen
            // in normal flow; claim-shared-record-handoff module is the primary path).
            // Both sides are proven to exist: inviter created the invite, claimer just claimed it.
            sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: false },
            sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: false },
            revealSnapshot: { status: 'waiting_other_side', revealed: false, relationshipNameRevealed: false },
          }
      : {
          sideA: {
            exists: true,
            identityStatus: isVerified ? 'verified' : 'draft',
            hasPrivateReading: false,
          },
          sideB: {
            exists: false,
            identityStatus: 'missing',
            hasPrivateReading: false,
          },
          revealSnapshot: {
            status: 'waiting_other_side',
            revealed: false,
            relationshipNameRevealed: false,
          },
        },
  });
  state.relations = [relation, ...state.relations];
  emitChange();
  persist();
  return relation;
}

function normalizeHandle(raw: string) {
  const noSpaces = raw.trim().toLowerCase().replace(/\s+/g, '');
  const noAt = noSpaces.replace(/^@+/, '');
  const safe = noAt.replace(/[^a-z0-9._-]/g, '');
  if (!safe) return '';
  return `@${safe}`;
}

function normalizeAvatarSeed(raw: string, displayName: string) {
  const seed = raw.trim().toUpperCase().replace(/\s+/g, '').slice(0, 2);
  if (seed) return seed;
  const fallback = displayName.trim().charAt(0).toUpperCase();
  return fallback || '?';
}

function normalizeOptionalHandle(raw: string) {
  const normalized = normalizeHandle(raw);
  return normalized || undefined;
}

function setMe(update: MeProfileUpdate): boolean {
  const displayName = update.displayName.trim();
  const handle = normalizeHandle(update.handle);
  const avatarSeed = normalizeAvatarSeed(update.avatarSeed, displayName);

  if (!displayName || !handle) return false;

  state.me = {
    ...state.me,
    displayName,
    handle,
    avatarSeed,
    isProfileSetup: true,
    ...(update.showBaobabCode !== undefined ? { showBaobabCode: update.showBaobabCode } : {}),
  };
  emitChange();
  persist();
  return true;
}

function setShowBaobabCode(show: boolean): void {
  if (state.me.showBaobabCode === show) return;
  state.me = { ...state.me, showBaobabCode: show };
  emitChange();
  persist();
}

function setPhotoUri(uri: string | null): void {
  if (state.me.photoUri === uri) return;
  state.me = { ...state.me, photoUri: uri };
  emitChange();
  persist();
}

function setRelation(id: string, update: RelationUpdate): boolean {
  const cleanName = update.name.trim();
  if (!cleanName) return false;

  let didUpdate = false;
  state.relations = state.relations.map((relation) => {
    if (relation.id !== id) return relation;
    const normalizedHandle = update.handle === undefined
      ? relation.handle
      : normalizeOptionalHandle(update.handle);
    const normalizedAvatarSeed = update.avatarSeed === undefined
      ? relation.avatarSeed ?? normalizeAvatarSeed('', cleanName)
      : normalizeAvatarSeed(update.avatarSeed, cleanName);
    didUpdate = true;
    return applyNormalizedRelationModel({
      ...relation,
      name: cleanName,
      privateLabel: cleanName,
      handle: normalizedHandle,
      avatarSeed: normalizedAvatarSeed,
    });
  });

  if (!didUpdate) return false;
  emitChange();
  persist();
  return true;
}

function setInviteDeliveryOpened(id: string): void {
  if (!state.relations.some((r) => r.id === id)) return;
  state.relations = state.relations.map((r) =>
    r.id === id
      ? { ...r, inviteDeliveryOpenedAt: r.inviteDeliveryOpenedAt ?? new Date().toISOString() }
      : r,
  );
  emitChange();
  persist();
}

function attachCanonicalRelationId(localId: string, canonicalId: string): boolean {
  let didUpdate = false;
  state.relations = state.relations.map((relation) => {
    if (relation.id !== localId) return relation;
    // Never overwrite an existing canonicalRelationId — it is immutable once set.
    if (relation.canonicalRelationId) return relation;
    didUpdate = true;
    return applyNormalizedRelationModel({
      ...relation,
      canonicalRelationId: canonicalId,
    });
  });
  if (!didUpdate) return false;
  emitChange();
  persist();
  return true;
}

/**
 * Minimal input shape expected from the my_shared_relationships RPC.
 * Defined here so the store owns the contract; the fetch layer (lib/bootstrap-shared-relations.ts)
 * imports this type rather than the reverse.
 */
export type SharedRelationBootstrapInput = {
  relationship_id: string;
  /** One of the SharedRevealStatus values, as returned by the backend. */
  status: string;
  /** Which side the current user occupies: 'sideA' or 'sideB'. Server-computed. */
  my_side: string;
  /** Explicit proof that sideA participant is bound (side_a_user_id is not null). */
  side_a_present: boolean;
  /** Explicit proof that sideB participant is bound (side_b_user_id is not null). */
  side_b_present: boolean;
  side_a_reading_id: string | null;
  side_b_reading_id: string | null;
  /** ISO timestamp — when cooking_reveal phase began. Null if not yet in cooking state. */
  cooking_started_at: string | null;
  /** ISO timestamp — when the cooking timer expires and reveal becomes available. */
  unlock_at: string | null;
  /** ISO timestamp — when reveal_ready state was entered. */
  ready_at: string | null;
  /** ISO timestamp — when the reveal was opened. */
  revealed_at: string | null;
  /** Whether the relationship name was revealed. Only meaningful when status is 'revealed'. */
  relationship_name_revealed: boolean;
  /**
   * The publicProfileId of the other participant.
   * Computed server-side — no auth.uid() is ever exposed.
   * Null when the counterpart has not provisioned a public profile, or their slot is empty.
   *
   * Signal only — not a relation key. Does not authorize automatic merge.
   */
  counterpart_public_profile_id: string | null;
};

/**
 * Pure helper: projects shared backend truth into a local RelationshipLocalState.
 *
 * Used by both bootstrap materialization and (eventually) claim materialization.
 * Centralizes the mapping: presence + reading ids + status + timestamps → local state.
 *
 * Invariants:
 *   - hasPrivateReading requires both presence AND a non-null reading_id.
 *   - revealSnapshot timestamps are only set if truthy strings.
 *   - Timestamps beyond the current status are not projected (e.g., revealed_at
 *     is only set when status is 'revealed').
 */
function buildSharedRevealLocalState(data: SharedRelationBootstrapInput): RelationshipLocalState {
  const normalizedStatus: RelationshipRevealSnapshot['status'] = isRevealStatus(data.status)
    ? data.status
    : 'waiting_other_side';
  const revealed = normalizedStatus === 'revealed';
  const isCooking = normalizedStatus === 'cooking_reveal';
  const isReady = normalizedStatus === 'reveal_ready';

  const sideAPresent = data.side_a_present === true;
  const sideBPresent = data.side_b_present === true;

  function toOptionalTs(value: string | null | undefined): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  return {
    sideA: {
      exists: sideAPresent,
      identityStatus: sideAPresent ? 'verified' : 'missing',
      hasPrivateReading: sideAPresent && data.side_a_reading_id !== null,
    },
    sideB: {
      exists: sideBPresent,
      identityStatus: sideBPresent ? 'verified' : 'missing',
      hasPrivateReading: sideBPresent && data.side_b_reading_id !== null,
    },
    revealSnapshot: {
      status: normalizedStatus,
      revealed,
      relationshipNameRevealed: revealed ? data.relationship_name_revealed === true : false,
      // cooking_started_at and unlock_at are only meaningful during cooking_reveal.
      // ready_at is only meaningful from reveal_ready onward.
      // revealed_at is only meaningful once revealed.
      cookingStartedAt: isCooking || isReady || revealed ? toOptionalTs(data.cooking_started_at) : undefined,
      unlockAt: isCooking ? toOptionalTs(data.unlock_at) : undefined,
      readyAt: isReady || revealed ? toOptionalTs(data.ready_at) : undefined,
      revealedAt: revealed ? toOptionalTs(data.revealed_at) : undefined,
    },
  };
}

/**
 * Idempotent upsert: for each backend row, create a minimal local relation if one
 * with the same canonicalRelationId does not already exist.
 *
 * Dedup key: canonicalRelationId only — never name / handle / heuristic.
 * Relations already present in the store (any source) are untouched.
 * Non-canonical rows (missing relationship_id) are silently skipped.
 */
function upsertBootstrappedSharedRelations(rows: SharedRelationBootstrapInput[]): void {
  if (!rows.length) return;

  let didChange = false;
  for (const row of rows) {
    const canonicalId = typeof row.relationship_id === 'string' ? row.relationship_id.trim() : '';
    if (!canonicalId) continue;

    // Idempotent: skip if already materialized by any source.
    if (state.relations.some((r) => r.canonicalRelationId === canonicalId)) continue;

    const localState = buildSharedRevealLocalState(row);
    const revealed = localState.revealSnapshot.revealed;

    const relation = applyNormalizedRelationModel({
      // Suffix ensures uniqueness when multiple rows are bootstrapped in the same tick.
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      // Placeholder: name is not available from the shared record.
      // The user can rename via the relation edit screen.
      name: '(shared)',
      privateLabel: '(shared)',
      archived: false,
      createdAt: new Date().toISOString(),
      identityStatus: 'verified',
      relationshipNameRevealed: revealed,
      avatarSeed: '?',
      anchorMode: 'bootstrap',
      anchorValue: null,
      relationDepth: 'known',
      source: 'bootstrap',
      canonicalRelationId: canonicalId,
      counterpartPublicProfileId: row.counterpart_public_profile_id ?? null,
      localState,
    });

    state.relations = [relation, ...state.relations];
    didChange = true;
  }

  if (didChange) {
    emitChange();
    persist();
  }
}

function resetDevStateToSeed() {
  state.me = { ...SEED_ME };
  state.relations = SEED_RELATIONS.map(applyNormalizedRelationModel);
  state.evaluations = [...SEED_EVALUATIONS];
  state.places = [...SEED_PLACES];
  state.progressivePrivateSignals = {};
  hydrated = true;
  emitChange();
  void clearPersistedState().finally(() => {
    persistState<PersistedState>({
      me: state.me,
      relations: state.relations,
      evaluations: state.evaluations,
      places: state.places,
      progressivePrivateSignals: state.progressivePrivateSignals,
      seedVersion: SEED_VERSION,
    });
  });
}

function loadLargeNetworkSeedData() {
  if (!__DEV__) return;
  const { me, relations, evaluations } = generateLargeNetworkSeed();
  state.me = me as typeof state.me;
  state.relations = (relations as Parameters<typeof applyNormalizedRelationModel>[0][]).map(applyNormalizedRelationModel);
  state.evaluations = evaluations;
  state.places = [];
  state.progressivePrivateSignals = {};
  hydrated = true;
  emitChange();
  void clearPersistedState().finally(() => {
    persistState<PersistedState>({
      me: state.me,
      relations: state.relations,
      evaluations: state.evaluations,
      places: state.places,
      progressivePrivateSignals: state.progressivePrivateSignals,
      seedVersion: SEED_VERSION,
    });
  });
}

// ── hook ───────────────────────────────────────────────────────────────

export function useRelationsStore() {
  const me = useSyncExternalStore(subscribe, getMeSnapshot, getMeSnapshot);
  const relations = useSyncExternalStore(subscribe, getRelationsSnapshot, getRelationsSnapshot);
  const evaluations = useSyncExternalStore(subscribe, getEvaluationsSnapshot, getEvaluationsSnapshot);
  const places = useSyncExternalStore(subscribe, getPlacesSnapshot, getPlacesSnapshot);
  const progressivePrivateSignals = useSyncExternalStore(
    subscribe,
    getProgressivePrivateSignalsSnapshot,
    getProgressivePrivateSignalsSnapshot,
  );
  const isHydrated = useSyncExternalStore(subscribe, getHydratedSnapshot, getHydratedSnapshot);

  const activeRelations = relations.filter((r) => !r.archived);
  const archivedRelations = relations.filter((r) => r.archived);

  const archiveRelation = (id: string) => { setArchived(id, true); };
  const restoreRelation = (id: string) => { setArchived(id, false); };
  const addEvaluation = (evaluation: Evaluation) => pushEvaluation(evaluation);
  const attachPrivateReadingToRelationshipSide = (
    evaluation: Evaluation,
    side: RelationshipSideKey,
  ) => pushEvaluationForSide(evaluation, side);
  const addRelation = (name: string, meta?: RelationSourceMeta) => {
    if (!meta) return pushRelation(name);
    return pushRelationWithSource(name, meta);
  };
  const updateMe = (update: MeProfileUpdate) => setMe(update);
  const updateShowBaobabCode = (show: boolean) => setShowBaobabCode(show);
  const updatePhotoUri = (uri: string | null) => setPhotoUri(uri);
  const updateRelation = (id: string, update: RelationUpdate) => setRelation(id, update);
  const addPlace = (input: PlaceCreateInput) => pushPlace(input);
  const updatePlace = (id: string, update: PlaceUpdateInput) => setPlace(id, update);
  const resolveInvitedSideB = (relationId: string) => resolveInviteSideB(relationId);
  const startCookingReveal = (relationId: string) => finalizeCookingStart(relationId);
  const syncRevealReadyState = (relationId: string) => markRevealReadyIfUnlocked(relationId);
  const revealMutualRelationship = (relationId: string) => openMutualReveal(relationId);
  const resetDevState = () => resetDevStateToSeed();
  const loadLargeNetworkSeed = () => loadLargeNetworkSeedData();
  const setAuthIdentity = (userId: string | null) => hydrateAuthIdentity(userId);
  const setPublicProfileId = (id: string | null) => hydratePublicProfileId(id);
  const setCanonicalRelationId = (localId: string, canonicalId: string) =>
    attachCanonicalRelationId(localId, canonicalId);
  const markInviteDeliveryOpened = (id: string) => setInviteDeliveryOpened(id);
  const bootstrapSharedRelations = (rows: SharedRelationBootstrapInput[]) =>
    upsertBootstrappedSharedRelations(rows);
  const setProgressivePrivateSignal = (
    relationId: string,
    pillarKey: PillarKey,
    criterionKey: ProgressiveCriterionKey,
    rating: 1 | 2 | 3 | 4 | 5,
  ) => writeProgressivePrivateSignal(relationId, pillarKey, criterionKey, rating);

  const getAssistedReconciliationSuggestionForRelation = (relationId: string) =>
    findAssistedReconciliationSuggestionForRelation(relationId, relations);

  const getDraftResolutionSuggestionForRelation = (relationId: string) =>
    findDraftResolutionSuggestionForRelation(relationId, relations);

  const setRelationPrivateOpenWorlds = (id: string, worlds: RelationOpenWorld[]) =>
    updateRelationPrivateOpenWorlds(id, worlds);

  return {
    me,
    relations,
    evaluations,
    places,
    progressivePrivateSignals,
    setProgressivePrivateSignal,
    activeRelations,
    archivedRelations,
    archiveRelation,
    restoreRelation,
    addEvaluation,
    attachPrivateReadingToRelationshipSide,
    addRelation,
    updateRelation,
    updatePlace,
    resolveInvitedSideB,
    startCookingReveal,
    syncRevealReadyState,
    revealMutualRelationship,
    resetDevState,
    loadLargeNetworkSeed,
    updateMe,
    updateShowBaobabCode,
    updatePhotoUri,
    addPlace,
    isHydrated,
    setAuthIdentity,
    setPublicProfileId,
    setCanonicalRelationId,
    markInviteDeliveryOpened,
    bootstrapSharedRelations,
    getAssistedReconciliationSuggestionForRelation,
    getDraftResolutionSuggestionForRelation,
    setRelationPrivateOpenWorlds,
  };
}
