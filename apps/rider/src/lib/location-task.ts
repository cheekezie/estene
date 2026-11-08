import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ApiError, api } from './api';
import { HEARTBEAT_EVERY_MS } from './config';
import { session } from './session';

/**
 * Background location while the rider is online. Defined at module scope (and
 * imported from index.ts) so it exists even when Android wakes the app headless.
 */
export const LOCATION_TASK = 'estene-rider-location';

type Listener = (reason: string) => void;
const stoppedListeners = new Set<Listener>();
/** Fires when sharing stops on its own (account suspended, signed out). */
export const onSharingStopped = (fn: Listener) => {
  stoppedListeners.add(fn);
  return () => {
    stoppedListeners.delete(fn);
  };
};

let lastSentAt = 0;

export async function sendHeartbeat(coords: Location.LocationObjectCoords) {
  await api.post('/api/rider/presence/heartbeat', {
    lat: coords.latitude,
    lng: coords.longitude,
    ...(coords.heading != null && coords.heading >= 0 && coords.heading <= 360
      ? { heading: coords.heading }
      : {}),
    ...(coords.speed != null && coords.speed >= 0 ? { speedKph: coords.speed * 3.6 } : {}),
  });
  lastSentAt = Date.now();
}

export async function stopSharing() {
  if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
  }
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    // Updates can arrive every second on iOS; the API only needs one every ~20 s.
    if (Date.now() - lastSentAt < HEARTBEAT_EVERY_MS - 2_000) return;
    const latest = data.locations[data.locations.length - 1];
    try {
      await sendHeartbeat(latest.coords);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // Suspended, or signed out: stop using the rider's location.
        await stopSharing();
        await session.setOnline(false);
        stoppedListeners.forEach((fn) =>
          fn(err.status === 403 ? err.message : 'You were signed out.'),
        );
      }
      // Network errors: try again on the next update.
    }
  },
);
