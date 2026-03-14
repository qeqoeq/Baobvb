import * as Linking from 'expo-linking';

export type RelationshipInvitePayload = {
  message: string;
  url?: string;
};

function buildRelationshipInviteUrl(relationId: string): string | undefined {
  const cleanRelationId = relationId.trim();
  if (!cleanRelationId) return undefined;

  const encodedRelationId = encodeURIComponent(cleanRelationId);
  return Linking.createURL(`invite/${encodedRelationId}`);
}

export function getRelationshipInviteMessage(relationId: string): RelationshipInvitePayload {
  const url = buildRelationshipInviteUrl(relationId);
  return {
    message:
      'I saved my side of our relationship on Baobab. Join me to reveal it together.',
    url,
  };
}
