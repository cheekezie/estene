import * as SecureStore from 'expo-secure-store';

/**
 * Tokens live in the device keychain/keystore. AFTER_FIRST_UNLOCK lets the
 * background location task read them while the phone is locked.
 */
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const KEYS = {
  access: 'estene.accessToken',
  refresh: 'estene.refreshToken',
  user: 'estene.user',
  pushToken: 'estene.pushToken',
  online: 'estene.online',
} as const;

export type SessionUser = { id: string; name: string; code: string };

const get = (k: string) => SecureStore.getItemAsync(k, OPTS);
const set = (k: string, v: string) => SecureStore.setItemAsync(k, v, OPTS);
const del = (k: string) => SecureStore.deleteItemAsync(k, OPTS);

export const session = {
  accessToken: () => get(KEYS.access),
  refreshToken: () => get(KEYS.refresh),
  async user(): Promise<SessionUser | null> {
    const raw = await get(KEYS.user);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  },
  async save(tokens: { accessToken: string; refreshToken: string }, user?: SessionUser) {
    await set(KEYS.access, tokens.accessToken);
    await set(KEYS.refresh, tokens.refreshToken);
    if (user) await set(KEYS.user, JSON.stringify(user));
  },
  async clear() {
    await Promise.all([del(KEYS.access), del(KEYS.refresh), del(KEYS.user), del(KEYS.online)]);
  },

  pushToken: () => get(KEYS.pushToken),
  setPushToken: (t: string | null) => (t ? set(KEYS.pushToken, t) : del(KEYS.pushToken)),

  /** Whether the rider chose to be online — survives app restarts. */
  async isOnline() {
    return (await get(KEYS.online)) === '1';
  },
  setOnline: (on: boolean) => (on ? set(KEYS.online, '1') : del(KEYS.online)),
};
