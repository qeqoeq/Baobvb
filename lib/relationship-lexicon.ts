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
    colorLabel: 'Ambre chaud',
    definition: 'Une relation profonde, avec une présence durable, une confiance forte et une histoire partagée.',
  },
  Anchor: {
    canonicalName: 'Anchor',
    colorLabel: 'Bleu-vert profond',
    definition: 'Une relation fiable et sûre, avec une présence qui compte.',
  },
  Steady: {
    canonicalName: 'Steady',
    colorLabel: 'Sauge doux',
    definition: 'Une relation à la présence constante, au signal fiable et au rythme stable.',
  },
  Active: {
    canonicalName: 'Active',
    colorLabel: 'Rose poudré',
    definition: 'Une relation en mouvement, avec des échanges visibles et un signal mutuel qui grandit.',
  },
  Forming: {
    canonicalName: 'Forming',
    colorLabel: 'Or doux',
    definition: 'Une relation encore en train de prendre forme : premiers signaux, mais peu de preuves partagées.',
  },
  Distant: {
    canonicalName: 'Distant',
    colorLabel: 'Gris brume',
    definition: 'Une relation au signal faible en ce moment, avec peu de présence active.',
  },
};

export function getRelationshipLexiconEntry(tier: Tier): RelationshipLexiconEntry {
  return RELATIONSHIP_LEXICON[tier];
}

export function isRelationshipNameRevealed(relation: Pick<Relation, 'relationshipNameRevealed'>): boolean {
  return relation.relationshipNameRevealed === true;
}
