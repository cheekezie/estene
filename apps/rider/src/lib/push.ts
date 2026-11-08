import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { colors } from '@estene/theme/tokens';
import type { RiderPushData } from '@estene/contracts/rider';
import { api } from './api';
import { session } from './session';

/** Offers must wake a locked phone: loud, high-priority channel. */
export const OFFER_CHANNEL = 'offers';

// Show offers as a banner with sound even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function isOfferPush(data: unknown): data is RiderPushData {
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === 'offer';
}

/** Registers this phone for offer notifications. Never throws — push is a bonus to polling. */
export async function registerForPush() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(OFFER_CHANNEL, {
        name: 'Job offers',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 400, 200, 400],
        lightColor: colors.accent,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    if (!Device.isDevice) return; // simulators can't receive push
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn(
        '[push] No EAS project id (set EAS_PROJECT_ID) — offers will arrive by polling only.',
      );
      return;
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post('/api/rider/push-token', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    await session.setPushToken(token);
  } catch (err) {
    console.warn('[push] registration failed', err);
  }
}

/** Stops offers going to this phone after sign-out. */
export async function unregisterPush() {
  const token = await session.pushToken();
  if (!token) return;
  await api.post('/api/rider/push-token/clear', { token }).catch(() => undefined);
  await session.setPushToken(null);
}
