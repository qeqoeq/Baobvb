import type { Tier } from './evaluation';
import type { Relation } from '../store/useRelationsStore';

export type RelationshipLexiconEntry = {
  canonicalName: Tier;
  colorLabel: string;
  definition: string;
};

// Local lexicon registry (canonical names stay stable for future i18n mapping).
const RELATIONSHIP_LEXICON: Record<Tier, RelationshipLexiconEntry> = {
  Legend: {
    canonicalName: 'Legend',
    colorLabel: 'Warm amber',
    definition: 'A rare relationship with deep trust, strong continuity, and lasting presence.',
  },
  Anchor: {
    canonicalName: 'Anchor',
    colorLabel: 'Deep teal',
    definition: 'A grounded relationship that feels dependable across time and context.',
  },
  Vibrant: {
    canonicalName: 'Vibrant',
    colorLabel: 'Muted sage',
    definition: 'A lively relationship with healthy momentum and meaningful reciprocity.',
  },
  Thrill: {
    canonicalName: 'Thrill',
    colorLabel: 'Dusty rose',
    definition: 'A relationship full of intensity and movement that still seeks stronger roots.',
  },
  Spark: {
    canonicalName: 'Spark',
    colorLabel: 'Soft gold',
    definition: 'An early relationship with visible potential and promising first signals.',
  },
  Ghost: {
    canonicalName: 'Ghost',
    colorLabel: 'Mist gray',
    definition: 'A distant relationship with low current signal and limited active presence.',
  },
};

export function getRelationshipLexiconEntry(tier: Tier): RelationshipLexiconEntry {
  return RELATIONSHIP_LEXICON[tier];
}

export function isRelationshipNameRevealed(relation: Pick<Relation, 'relationshipNameRevealed'>): boolean {
  return relation.relationshipNameRevealed === true;
}
