/**
 * lib/dev/large-network-seed.ts
 *
 * Dev-only large network seed for visual stress-testing of Bao.
 * ~150 contacts across realistic social clusters with secondary connections.
 *
 * Activate  : Garden → "Load stress test — 150 contacts"
 * Deactivate: Garden → "Reset local dev state"
 *
 * NOT a Supabase migration. NOT production data. NOT a schema change.
 * Only imported inside a __DEV__ guard in the store.
 */

import { computeScore, getTier, type Evaluation, type PillarKey, type PillarRating } from '../evaluation';

// ─── Minimal inline types (avoids circular import with the store) ─────────────

type SeedSideState = {
  exists: boolean;
  identityStatus: 'missing' | 'draft' | 'verified';
  hasPrivateReading: boolean;
  privateReadingId?: string;
};

type SeedRevealSnapshot = {
  status: 'waiting_other_side' | 'cooking_reveal' | 'reveal_ready' | 'revealed';
  revealed: boolean;
  cookingStartedAt?: string;
  readyAt?: string;
  revealedAt?: string;
  mutualScore?: number;
  relationshipNameRevealed?: boolean;
};

type SeedRelation = {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  identityStatus: 'draft' | 'verified';
  source: 'manual';
  avatarSeed: string;
  viaRelationId?: string;
  relationshipNameRevealed: boolean;
  localState: {
    sideA: SeedSideState;
    sideB: SeedSideState;
    revealSnapshot: SeedRevealSnapshot;
  };
};

type SeedMe = {
  id: string;
  displayName: string;
  handle: string;
  avatarSeed: string;
  showBaobabCode: boolean;
  isProfileSetup: boolean;
  internalAuthUserId: null;
  publicProfileId: null;
  photoUri: null;
};

// ─── Me ──────────────────────────────────────────────────────────────────────

export const LARGE_SEED_ME: SeedMe = {
  id: 'me-local-dev-large',
  displayName: 'Yasmin',
  handle: '@yasmin.baobab',
  avatarSeed: 'Y',
  showBaobabCode: true,
  isProfileSetup: true,
  internalAuthUserId: null,
  publicProfileId: null,
  photoUri: null,
};

// ─── Person spec ──────────────────────────────────────────────────────────────

type RevealStatus = 'revealed' | 'ready' | 'cooking' | 'waiting' | 'unread';

type PersonSpec = {
  id: string;
  name: string;
  st: RevealStatus;
  ms?: number;           // mutualScore — revealed only
  via?: string;          // viaRelationId — primarily_via anchor
  sn?: PillarRating;     // sharedNetwork pillar rating → gateway power
  r?: true;              // hasPrivateReading — cooking / waiting with reading
};

// ─── 150 contact specs ──────────────────────────────────��────────────────────
//
//  Distribution
//  ─────────────────────────���─────────────────────────────────────��─────────────
//  revealed     52  → networkCount "52 in your Bao"
//    - direct       44  → canvasMembers → EgoGraph 20 + "+24" overflow
//    - primarily_via 8  → invisible in Bao, visible in Through X screens
//  reveal_ready 16  → readyCount (teal footer dot)
//  cooking      16  → forming (amber footer dot)
//  waiting      12  → forming
//  unread       54  → forming
//  ────────────────────────────────────────────────���────────────────────────────
//  TOTAL       150
//
//  3 gateway anchors visible in canvas as halos:
//    L001 Aicha  sn:5  → strong  (Through Aicha)
//    L031 Clara  sn:5  → strong  (Through Clara)
//    L076 Sofia  sn:4  → moderate (Through Sofia)
//
//  8 primarily_via nodes (faint score + viaRelationId):
//    L013 L014 L015 L025  via L001 (Aicha)
//    L059                 via L031 (Clara)
//    L090 L091 L092       via L076 (Sofia)

const SPECS: PersonSpec[] = [
  // ── Famille proche (12) ──────────────────────────────────────────────────
  { id: 'L001', name: 'Aicha',        st: 'revealed', ms: 88, sn: 5 },
  { id: 'L002', name: 'Karim',        st: 'revealed', ms: 82, sn: 4 },
  { id: 'L003', name: 'Nassim',       st: 'revealed', ms: 75, sn: 3 },
  { id: 'L004', name: 'Lila',         st: 'revealed', ms: 70, sn: 3 },
  { id: 'L005', name: 'Fatima',       st: 'revealed', ms: 65, sn: 2 },
  { id: 'L006', name: 'Omar',         st: 'revealed', ms: 58, sn: 2 },
  { id: 'L007', name: 'Driss',        st: 'cooking',  r: true },
  { id: 'L008', name: 'Houria',       st: 'cooking',  r: true },
  { id: 'L009', name: 'Imane',        st: 'ready' },
  { id: 'L010', name: 'Yassine',      st: 'ready' },
  { id: 'L011', name: 'Céline',       st: 'waiting',  r: true },
  { id: 'L012', name: 'Thomas',       st: 'revealed', ms: 60, sn: 2 },

  // ── Famille élargie (18) ──────────────────────────────��──────────────────
  // L013-L015, L025 → via Aicha (faint) → primarily_via in Through Aicha
  { id: 'L013', name: 'Rachida',      st: 'revealed', ms: 35, via: 'L001', sn: 1 },
  { id: 'L014', name: 'Sofiane',      st: 'revealed', ms: 32, via: 'L001', sn: 1 },
  { id: 'L015', name: 'Mehdi',        st: 'revealed', ms: 28, via: 'L001', sn: 1 },
  { id: 'L016', name: 'Nadia',        st: 'revealed', ms: 34, sn: 1 },
  { id: 'L017', name: 'Samira',       st: 'revealed', ms: 38, sn: 2 },
  { id: 'L018', name: 'Abdelkrim',    st: 'waiting',  r: true },
  { id: 'L019', name: 'Zineb',        st: 'waiting',  r: true },
  { id: 'L020', name: 'Mourad',       st: 'unread' },
  { id: 'L021', name: 'Leila',        st: 'unread' },
  { id: 'L022', name: 'Farida',       st: 'unread' },
  { id: 'L023', name: 'Kamel',        st: 'cooking',  r: true },
  { id: 'L024', name: 'Siham',        st: 'revealed', ms: 42, sn: 2 },
  { id: 'L025', name: 'Nordine',      st: 'revealed', ms: 30, via: 'L001', sn: 1 },
  { id: 'L026', name: 'Brahim',       st: 'unread' },
  { id: 'L027', name: 'Dalila',       st: 'unread' },
  { id: 'L028', name: 'Hafida',       st: 'ready' },
  { id: 'L029', name: 'Samir',        st: 'ready' },
  { id: 'L030', name: 'Meriem',       st: 'revealed', ms: 45, sn: 2 },

  // ── Amis très proches (8) ────────────────────────────────────────────────
  // Clara → strong gateway sn:5 — Through Clara world
  { id: 'L031', name: 'Clara',        st: 'revealed', ms: 92, sn: 5 },
  { id: 'L032', name: 'Mathieu',      st: 'revealed', ms: 85, sn: 4 },
  { id: 'L033', name: 'Jade',         st: 'revealed', ms: 80, sn: 4 },
  { id: 'L034', name: 'Inès',         st: 'revealed', ms: 77, sn: 3 },
  { id: 'L035', name: 'Romain',       st: 'revealed', ms: 72, sn: 3 },
  { id: 'L036', name: 'Léa',          st: 'revealed', ms: 68, sn: 2 },
  { id: 'L037', name: 'Hugo',         st: 'cooking',  r: true },
  { id: 'L038', name: 'Emma',         st: 'ready' },

  // ── Amis réguliers (17) ──────────────────────────────────────────────────
  { id: 'L039', name: 'Kevin',        st: 'revealed', ms: 62, sn: 3 },
  { id: 'L040', name: 'Julie',        st: 'revealed', ms: 58, sn: 2 },
  { id: 'L041', name: 'Nicolas',      st: 'revealed', ms: 55, sn: 2 },
  { id: 'L042', name: 'Marie',        st: 'revealed', ms: 52, sn: 2 },
  { id: 'L043', name: 'Alexandre',    st: 'revealed', ms: 48, sn: 2 },
  { id: 'L044', name: 'Sophie',       st: 'revealed', ms: 45, sn: 2 },
  { id: 'L045', name: 'Baptiste',     st: 'revealed', ms: 43, sn: 2 },
  { id: 'L046', name: 'Camille',      st: 'revealed', ms: 41, sn: 2 },
  { id: 'L047', name: 'Pierre',       st: 'cooking',  r: true },
  { id: 'L048', name: 'Alice',        st: 'cooking',  r: true },
  { id: 'L049', name: 'Thomas',       st: 'ready' },
  { id: 'L050', name: 'Lucie',        st: 'ready' },
  { id: 'L051', name: 'Antoine',      st: 'waiting',  r: true },
  { id: 'L052', name: 'Elisa',        st: 'waiting',  r: true },
  { id: 'L053', name: 'Victor',       st: 'unread' },
  { id: 'L054', name: 'Manon',        st: 'unread' },
  { id: 'L055', name: 'Julien',       st: 'ready' },

  // ── Anciens amis / école (20) ────────────────────────────────────────────
  // L059 → via Clara (faint) → primarily_via in Through Clara
  { id: 'L056', name: 'Chloé',        st: 'revealed', ms: 38, sn: 1 },
  { id: 'L057', name: 'Axel',         st: 'revealed', ms: 35, sn: 1 },
  { id: 'L058', name: 'Pauline',      st: 'revealed', ms: 30, sn: 1 },
  { id: 'L059', name: 'Tristan',      st: 'revealed', ms: 28, via: 'L031', sn: 1 },
  { id: 'L060', name: 'Clémence',     st: 'cooking',  r: true },
  { id: 'L061', name: 'Maxime',       st: 'cooking',  r: true },
  { id: 'L062', name: 'Anaïs',        st: 'waiting',  r: true },
  { id: 'L063', name: 'Florian',      st: 'waiting',  r: true },
  { id: 'L064', name: 'Laura',        st: 'unread' },
  { id: 'L065', name: 'Théo',         st: 'unread' },
  { id: 'L066', name: 'Marion',       st: 'unread' },
  { id: 'L067', name: 'Valentin',     st: 'unread' },
  { id: 'L068', name: 'Noémie',       st: 'unread' },
  { id: 'L069', name: 'Sébastien',    st: 'unread' },
  { id: 'L070', name: 'Mélanie',      st: 'ready' },
  { id: 'L071', name: 'Rémi',         st: 'ready' },
  { id: 'L072', name: 'Charline',     st: 'unread' },
  { id: 'L073', name: 'Geoffrey',     st: 'unread' },
  { id: 'L074', name: 'Leslie',       st: 'unread' },
  { id: 'L075', name: 'Aurélien',     st: 'unread' },

  // ── Collègues directs (14) ───────────────────────────────────────────────
  // Sofia → moderate gateway sn:4 — Through Sofia world
  { id: 'L076', name: 'Sofia',        st: 'revealed', ms: 72, sn: 4 },
  { id: 'L077', name: 'Luca',         st: 'revealed', ms: 65, sn: 3 },
  { id: 'L078', name: 'Amélie',       st: 'revealed', ms: 60, sn: 2 },
  { id: 'L079', name: 'Antoine',      st: 'revealed', ms: 55, sn: 2 },
  { id: 'L080', name: 'Marine',       st: 'revealed', ms: 50, sn: 2 },
  { id: 'L081', name: 'Raphaël',      st: 'cooking',  r: true },
  { id: 'L082', name: 'Océane',       st: 'cooking',  r: true },
  { id: 'L083', name: 'Gabriel',      st: 'ready' },
  { id: 'L084', name: 'Lucie',        st: 'ready' },
  { id: 'L085', name: 'Margaux',      st: 'waiting',  r: true },
  { id: 'L086', name: 'Mathis',       st: 'waiting',  r: true },
  { id: 'L087', name: 'Elisa',        st: 'unread' },
  { id: 'L088', name: 'Damien',       st: 'unread' },
  { id: 'L089', name: 'Nathalie',     st: 'revealed', ms: 44, sn: 2 },

  // ── Collègues faibles (22) ───────────────────────────────────────────────
  // L090-L092 → via Sofia (faint) → primarily_via in Through Sofia
  { id: 'L090', name: 'Bertrand',     st: 'revealed', ms: 25, via: 'L076', sn: 1 },
  { id: 'L091', name: 'Stéphanie',    st: 'revealed', ms: 22, via: 'L076', sn: 1 },
  { id: 'L092', name: 'Laurent',      st: 'revealed', ms: 28, via: 'L076', sn: 1 },
  { id: 'L093', name: 'Pascal',       st: 'unread' },
  { id: 'L094', name: 'Isabelle',     st: 'unread' },
  { id: 'L095', name: 'François',     st: 'unread' },
  { id: 'L096', name: 'Sylvie',       st: 'unread' },
  { id: 'L097', name: 'Michel',       st: 'unread' },
  { id: 'L098', name: 'Catherine',    st: 'unread' },
  { id: 'L099', name: 'Éric',         st: 'unread' },
  { id: 'L100', name: 'Christine',    st: 'unread' },
  { id: 'L101', name: 'Renaud',       st: 'unread' },
  { id: 'L102', name: 'Véronique',    st: 'unread' },
  { id: 'L103', name: 'Patrick',      st: 'unread' },
  { id: 'L104', name: 'Anne-Claire',  st: 'unread' },
  { id: 'L105', name: 'Bernard',      st: 'unread' },
  { id: 'L106', name: 'Dominique',    st: 'unread' },
  { id: 'L107', name: 'Jean-Pierre',  st: 'unread' },
  { id: 'L108', name: 'Karine',       st: 'unread' },
  { id: 'L109', name: 'Thierry',      st: 'unread' },
  { id: 'L110', name: 'Monique',      st: 'unread' },
  { id: 'L111', name: 'Henri',        st: 'unread' },

  // ── Sport / hobby (16) ───────────────────────────────────────────────────
  { id: 'L112', name: 'Tom',          st: 'revealed', ms: 68, sn: 3 },
  { id: 'L113', name: 'Sarah',        st: 'revealed', ms: 65, sn: 2 },
  { id: 'L114', name: 'Alexis',       st: 'revealed', ms: 60, sn: 2 },
  { id: 'L115', name: 'Eva',          st: 'revealed', ms: 55, sn: 2 },
  { id: 'L116', name: 'Yoan',         st: 'revealed', ms: 50, sn: 2 },
  { id: 'L117', name: 'Camille',      st: 'revealed', ms: 45, sn: 2 },
  { id: 'L118', name: 'Florian',      st: 'revealed', ms: 42, sn: 2 },
  { id: 'L119', name: 'Audrey',       st: 'cooking',  r: true },
  { id: 'L120', name: 'Christophe',   st: 'cooking',  r: true },
  { id: 'L121', name: 'Mélissa',      st: 'ready' },
  { id: 'L122', name: 'Jordan',       st: 'ready' },
  { id: 'L123', name: 'Bastien',      st: 'waiting',  r: true },
  { id: 'L124', name: 'Noémie',       st: 'unread' },
  { id: 'L125', name: 'Quentin',      st: 'unread' },
  { id: 'L126', name: 'Pauline',      st: 'unread' },
  { id: 'L127', name: 'Xavier',       st: 'unread' },

  // ── Voisins / vie locale (11) ────────────────────────────────────────────
  { id: 'L128', name: 'Mme Durand',   st: 'revealed', ms: 38, sn: 1 },
  { id: 'L129', name: 'M. Lefebvre',  st: 'revealed', ms: 30, sn: 1 },
  { id: 'L130', name: 'Fatou',        st: 'cooking',  r: true },
  { id: 'L131', name: 'Hassan',       st: 'waiting',  r: true },
  { id: 'L132', name: 'Brigitte',     st: 'unread' },
  { id: 'L133', name: 'Roger',        st: 'unread' },
  { id: 'L134', name: 'Delphine',     st: 'unread' },
  { id: 'L135', name: 'Paul-Antoine', st: 'unread' },
  { id: 'L136', name: 'Estelle',      st: 'ready' },
  { id: 'L137', name: 'Samy',         st: 'unread' },
  { id: 'L138', name: 'Amandine',     st: 'unread' },

  // ── Services de confiance (7) ────────────────────────────────────────────
  { id: 'L139', name: 'Dr Benali',    st: 'revealed', ms: 35, sn: 1 },
  { id: 'L140', name: 'Me Chen',      st: 'cooking',  r: true },
  { id: 'L141', name: 'Ahmed',        st: 'waiting',  r: true },
  { id: 'L142', name: 'Sandra',       st: 'unread' },
  { id: 'L143', name: 'Brahim',       st: 'unread' },
  { id: 'L144', name: 'Patricia',     st: 'unread' },
  { id: 'L145', name: 'Lorenzo',      st: 'ready' },

  // ── Liens récents faibles (5) ────────────────────────────────────────────
  { id: 'L146', name: 'Amine',        st: 'cooking',  r: true },
  { id: 'L147', name: 'Léonie',       st: 'unread' },
  { id: 'L148', name: 'Rayan',        st: 'unread' },
  { id: 'L149', name: 'Yasmine',      st: 'unread' },
  { id: 'L150', name: 'Marco',        st: 'cooking',  r: true },
];

// ─── Builder helpers ──────────────────────────────────────────────────────────

function isoOffset(daysAgo: number): string {
  const d = new Date('2026-05-01T12:00:00Z');
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function buildRelation(spec: PersonSpec, evalId: string | null, idx: number): SeedRelation {
  const sideVerified =
    spec.st === 'revealed' || spec.st === 'cooking' || spec.st === 'ready';
  const hasReading = spec.st === 'revealed' || spec.r === true;

  const sideA: SeedSideState = {
    exists: true,
    identityStatus: sideVerified ? 'verified' : 'draft',
    hasPrivateReading: hasReading,
    ...(hasReading && evalId ? { privateReadingId: evalId } : {}),
  };

  const sideB: SeedSideState = sideVerified
    ? { exists: true, identityStatus: 'verified', hasPrivateReading: spec.st === 'revealed' }
    : { exists: false, identityStatus: 'missing', hasPrivateReading: false };

  let revealSnapshot: SeedRevealSnapshot;
  switch (spec.st) {
    case 'revealed':
      revealSnapshot = {
        status: 'revealed',
        revealed: true,
        relationshipNameRevealed: true,
        revealedAt: isoOffset(350 - idx * 2),
        mutualScore: spec.ms ?? 50,
      };
      break;
    case 'ready':
      revealSnapshot = {
        status: 'reveal_ready',
        revealed: false,
        readyAt: isoOffset(3 + (idx % 7)),
      };
      break;
    case 'cooking':
      revealSnapshot = {
        status: 'cooking_reveal',
        revealed: false,
        cookingStartedAt: isoOffset(8 + (idx % 12)),
      };
      break;
    default:
      revealSnapshot = { status: 'waiting_other_side', revealed: false, relationshipNameRevealed: false };
  }

  return {
    id: spec.id,
    name: spec.name,
    archived: false,
    createdAt: isoOffset(550 - idx * 3),
    identityStatus: sideVerified ? 'verified' : 'draft',
    source: 'manual',
    avatarSeed: spec.name.charAt(0).toUpperCase(),
    relationshipNameRevealed: spec.st === 'revealed',
    ...(spec.via ? { viaRelationId: spec.via } : {}),
    localState: { sideA, sideB, revealSnapshot },
  };
}

function buildEval(spec: PersonSpec, evalId: string, idx: number): Evaluation {
  const sn = (spec.sn ?? 2) as PillarRating;
  let ratings: Record<PillarKey, PillarRating>;

  if (spec.st === 'revealed') {
    const ms = spec.ms ?? 50;
    if (ms >= 70) {
      ratings = { trust: 4, interactions: 4, affinity: 4, support: 4, sharedNetwork: sn };
    } else if (ms >= 40) {
      ratings = { trust: 3, interactions: 3, affinity: 3, support: 3, sharedNetwork: sn };
    } else {
      ratings = { trust: 2, interactions: 2, affinity: 2, support: 1, sharedNetwork: sn };
    }
  } else {
    // cooking / waiting with reading
    ratings = { trust: 3, interactions: 3, affinity: 3, support: 2, sharedNetwork: sn };
  }

  const score = computeScore(ratings);
  return {
    id: evalId,
    relationId: spec.id,
    ratings,
    score,
    tier: getTier(score),
    createdAt: isoOffset(550 - idx * 3),
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateLargeNetworkSeed(): {
  me: SeedMe;
  relations: SeedRelation[];
  evaluations: Evaluation[];
} {
  const relations: SeedRelation[] = [];
  const evaluations: Evaluation[] = [];
  let evalN = 0;

  SPECS.forEach((spec, idx) => {
    const hasReading = spec.st === 'revealed' || spec.r === true;
    const evalId = hasReading ? `LE${String(++evalN).padStart(3, '0')}` : null;
    relations.push(buildRelation(spec, evalId, idx));
    if (hasReading && evalId) {
      evaluations.push(buildEval(spec, evalId, idx));
    }
  });

  return { me: LARGE_SEED_ME, relations, evaluations };
}
