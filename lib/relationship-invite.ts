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

  if (__DEV__) {
    return Linking.createURL(`invite/${encodedRelationId}?token=${encodedInviteToken}`);
  }
  return `https://getbaobab.app/invite/${encodedRelationId}?token=${encodedInviteToken}`;
}

export function getRelationshipInviteMessage(params: {
  relationId: string;
  inviteToken: string;
  senderName?: string;
}): RelationshipInvitePayload {
  const url = buildRelationshipInviteUrl(params.relationId, params.inviteToken);
  const sender = params.senderName?.trim() || 'Someone';
  return {
    message: `${sender} opened a private space with you on Baobab. Nothing is public. Reveal it together when you're both ready.`,
    url,
  };
}
