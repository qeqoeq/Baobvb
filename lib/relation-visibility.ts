import type { Relation } from '../store/useRelationsStore';
import { isRelationshipNameRevealed } from './relationship-lexicon';

/**
 * Visibility predicates for the surfaces that list or COUNT relations (B20).
 *
 * Archived relations must never surface on the network canvas, the "in your Bao"
 * counter, the Through gateway views, or the lexicon. The Garden intentionally
 * has its own active/archived split and does not use these.
 */

/**
 * True when a relation appears as a node/count in the revealed network graph
 * (home EgoGraph, Network counter, Through gateway members): it is mutually
 * revealed AND not archived.
 */
export function isRevealedNetworkMember(
  relation: Pick<Relation, 'archived' | 'localState'>,
): boolean {
  return (
    !relation.archived &&
    relation.localState.revealSnapshot.status === 'revealed'
  );
}

/**
 * True when a relation contributes a discovered tier to the lexicon: its name
 * has been opened (revealed + firstViewedAt) AND it is not archived.
 */
export function isLexiconDiscoverable(
  relation: Pick<Relation, 'archived' | 'relationshipNameRevealed' | 'localState'>,
): boolean {
  return (
    !relation.archived &&
    isRelationshipNameRevealed(relation) &&
    relation.localState.revealSnapshot.firstViewedAt !== undefined
  );
}
