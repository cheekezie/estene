/** API origin, e.g. http://192.168.1.15:4000 locally or https://api.estene.ng. Set per EAS profile. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

/** How often the phone reports its position while online (the API marks riders offline after 90 s). */
export const HEARTBEAT_EVERY_MS = 20_000;
/** How often open offers are checked while the app is on screen (push covers the rest). */
export const OFFER_POLL_MS = 5_000;
