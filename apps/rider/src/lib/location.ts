import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { colors } from '@estene/theme/tokens';
import type { GeoPoint } from '@estene/contracts/common';
import { api } from './api';
import { HEARTBEAT_EVERY_MS } from './config';
import { LOCATION_TASK, sendHeartbeat, stopSharing } from './location-task';
import { session } from './session';

export class PermissionError extends Error {
  constructor(
    message: string,
    readonly canOpenSettings: boolean,
  ) {
    super(message);
  }
}

/**
 * Online needs "Allow all the time": the phone keeps reporting where the
 * rider is with the app in the background, so nearby jobs keep coming.
 */
async function ensurePermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted')
    throw new PermissionError(
      'Allow location so Estene can send you nearby jobs.',
      !fg.canAskAgain,
    );
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted')
    throw new PermissionError(
      Platform.OS === 'ios'
        ? 'In Settings, set Location to "Always" so jobs keep reaching you when the app is closed.'
        : 'In Settings, set Location to "Allow all the time" so jobs keep reaching you when the app is closed.',
      true,
    );
}

export const openSettings = () => Linking.openSettings();

export async function goOnline() {
  await ensurePermissions();
  if (!(await Location.hasServicesEnabledAsync()))
    throw new PermissionError('Turn on your phone’s location (GPS) to go online.', false);

  // Report straight away so dispatch sees the rider immediately (also checks the account is active).
  const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  await sendHeartbeat(now.coords);

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    // Time-based on Android; iOS reports by movement, so the task itself throttles.
    timeInterval: HEARTBEAT_EVERY_MS,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.OtherNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'You’re online',
      notificationBody: 'Estene is sharing your location while you’re online.',
      notificationColor: colors.primary,
      killServiceOnDestroy: false,
    },
  });
  await session.setOnline(true);
}

export async function goOffline() {
  await stopSharing();
  await session.setOnline(false);
  await api.post('/api/rider/presence/offline').catch(() => undefined);
}

/** True when the background updates are actually running (the OS may have stopped them). */
export const isSharing = () =>
  Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);

/** Best-effort current position for confirmations; undefined if unavailable within a few seconds. */
export async function currentPoint(): Promise<GeoPoint | undefined> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return undefined;
    const last = await Location.getLastKnownPositionAsync({
      maxAge: 60_000,
      requiredAccuracy: 200,
    });
    const pos =
      last ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((r) => setTimeout(() => r(null), 5_000)),
      ]));
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : undefined;
  } catch {
    return undefined;
  }
}
