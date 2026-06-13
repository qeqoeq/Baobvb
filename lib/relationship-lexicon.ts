import type { Tier } from './evaluation';
import type { Relation } from '../store/useRelationsStore';

export type RelationshipLexiconEntry = {
  canonicalName: Tier;
  colorLabel: string;
  definition: string;
};

// Local lexicon registry (canonical names stay stable for future i18n mapping).
const RELATIONSHIP_LEXICON: Record<Tier, RelationshipLexiconEntry> = {
  Rooted: {
    canonicalName: 'Rooted',
    colorLabel: 'Warm amber',
    definition: 'A deep relationship with lasting presence, strong trust, and shared history.',
  },
  Anchor: {
    canonicalName: 'Anchor',
    colorLabel: 'Deep teal',
    definition: 'A relationship with strong reliability, safety, and meaningful presence.',
  },
  Steady: {
    canonicalName: 'Steady',
    colorLabel: 'Muted sage',
    definition: 'A relationship with consistent presence, reliable signal, and a stable rhythm.',
  },
  Active: {
    canonicalName: 'Active',
    colorLabel: 'Dusty rose',
    definition: 'A relationship with present movement, visible exchanges, and growing mutual signal.',
  },
  Forming: {
    canonicalName: 'Forming',
    colorLabel: 'Soft gold',
    definition: 'A relationship still taking shape, with early signals but limited shared evidence.',
  },
  Distant: {
    canonicalName: 'Distant',
    colorLabel: 'Mist gray',
    definition: 'A relationship with limited current signal and little active presence.',
  },
};

export function getRelationshipLexiconEntry(tier: Tier): RelationshipLexiconEntry {
  return RELATIONSHIP_LEXICON[tier];
}

export function isRelationshipNameRevealed(relation: Pick<Relation, 'relationshipNameRevealed'>): boolean {
  return relation.relationshipNameRevealed === true;
}
