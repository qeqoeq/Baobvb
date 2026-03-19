import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getAuthenticatedUserId } from './supabase-auth';
import { supabase } from './supabase';

function getExpoProjectId(): string | null {
  const fromEasConfig = Constants.easConfig?.projectId;
  if (typeof fromEasConfig === 'string' && fromEasConfig.trim()) {
    return fromEasConfig.trim();
  }

  const fromExpoConfig = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExpoConfig === 'string' && fromExpoConfig.trim()) {
    return fromExpoConfig.trim();
  }

  return null;
}

export function configureNotificationPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export function extractRelationIdFromNotificationData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const relationId = (data as { relationId?: unknown }).relationId;
  if (typeof relationId !== 'string') return null;
  const clean = relationId.trim();
  return clean || null;
}

export function addRevealReadyNotificationResponseListener(
  onRelationOpen: (relationId: string) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const relationId = extractRelationIdFromNotificationData(response.notification.request.content.data);
    if (!relationId) return;
    onRelationOpen(relationId);
  });

  return () => {
    sub.remove();
  };
}

export async function getLaunchRelationIdFromLastNotification(): Promise<string | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return null;
  return extractRelationIdFromNotificationData(response.notification.request.content.data);
}

export async function registerDevicePushTokenForCurrentUser(): Promise<string | null> {
  await getAuthenticatedUserId();

  const currentPermissions = await Notifications.getPermissionsAsync();
  let granted = currentPermissions.granted;
  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }
  if (!granted) {
    return null;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    throw new Error('Missing EAS projectId required for Expo push token registration.');
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoPushToken = tokenResponse.data?.trim();
  if (!expoPushToken) {
    throw new Error('Expo push token registration returned an empty token.');
  }

  const { error } = await supabase.rpc('register_device_push_token', {
    p_expo_push_token: expoPushToken,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  if (error) {
    throw error;
  }

  return expoPushToken;
}
