export type RelationshipInvitePayload = {
  message: string;
  url?: string;
};

export function getRelationshipInviteMessage(relationId: string): RelationshipInvitePayload {
  void relationId;
  return {
    message:
      'I saved my side of our relationship on Baobab. Join me to reveal it together.',
  };
}
