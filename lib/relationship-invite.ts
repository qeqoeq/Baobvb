import * as Linking from 'expo-linking';

export type RelationshipInvitePayload = {
  message: string;
  url?: string;
};

export function buildRelationshipInviteUrl(
  relationId: string,
  inviteToken: string,
): string | undefined {
  const cleanRelationId = relationId.trim();
  const cleanInviteToken = inviteToken.trim();
  if (!cleanRelationId || !cleanInviteToken) return undefined;

  const encodedRelationId = encodeURIComponent(cleanRelationId);
  const encodedInviteToken = encodeURIComponent(cleanInviteToken);
  return Linking.createURL(`invite/${encodedRelationId}?token=${encodedInviteToken}`);
}

export function getRelationshipInviteMessage(params: {
  relationId: string;
  inviteToken: string;
}): RelationshipInvitePayload {
  const url = buildRelationshipInviteUrl(params.relationId, params.inviteToken);
  return {
    message:
      'I saved my side of our relationship on Baobab. Join me to reveal it together.',
    url,
  };
}
