import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { errorMessage } from '../lib/api';
import { HEARTBEAT_EVERY_MS } from '../lib/config';
import { onSharingStopped, sendHeartbeat } from '../lib/location-task';
import { currentPoint, goOffline, goOnline, isSharing, PermissionError } from '../lib/location';
import { session } from '../lib/session';

type OnlineContextValue = {
  online: boolean;
  busy: boolean;
  /** Why the last switch failed, or why sharing stopped. */
  problem: { message: string; canOpenSettings: boolean } | null;
  setOnline: (on: boolean) => Promise<void>;
  dismissProblem: () => void;
};

const OnlineContext = createContext<OnlineContextValue | null>(null);

export function OnlineProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnlineState] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<OnlineContextValue['problem']>(null);

  const setOnline = useCallback(async (on: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      if (on) await goOnline();
      else await goOffline();
      setOnlineState(on);
    } catch (err) {
      setProblem({
        message: errorMessage(err),
        canOpenSettings: err instanceof PermissionError && err.canOpenSettings,
      });
      if (on) await goOffline().catch(() => undefined);
      setOnlineState(false);
    } finally {
      setBusy(false);
    }
  }, []);

  // Restore after a restart: if the rider was online but the OS stopped the updates, start them again.
  useEffect(() => {
    void (async () => {
      if (!(await session.isOnline())) return;
      if (await isSharing()) setOnlineState(true);
      else await setOnline(true);
    })();
    return onSharingStopped((reason) => {
      setOnlineState(false);
      setProblem({ message: reason, canOpenSettings: false });
    });
  }, [setOnline]);

  // While the app is on screen, also report on a timer: iOS sends few updates when standing still.
  useEffect(() => {
    if (!online) return;
    const tick = async () => {
      if (AppState.currentState !== 'active') return;
      const point = await currentPoint();
      if (point)
        await sendHeartbeat({
          latitude: point.lat,
          longitude: point.lng,
          altitude: null,
          accuracy: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        }).catch(() => undefined);
    };
    const id = setInterval(tick, HEARTBEAT_EVERY_MS);
    return () => clearInterval(id);
  }, [online]);

  const value = useMemo(
    () => ({ online, busy, problem, setOnline, dismissProblem: () => setProblem(null) }),
    [online, busy, problem, setOnline],
  );
  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}

export function useOnline() {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error('useOnline must be used inside OnlineProvider');
  return ctx;
}
