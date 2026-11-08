import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
  useQueryClient,
} from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@estene/theme/tokens';
import { AuthProvider, useAuth } from '../hooks/auth';
import { OnlineProvider } from '../hooks/online';
import { keys } from '../hooks/queries';
import { ApiError } from '../lib/api';
import { isOfferPush } from '../lib/push';

// React Query: refetch when the app comes back to the foreground.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active'));
  return () => sub.remove();
});
onlineManager.setOnline(true);

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: (count, err) =>
          !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

/** Offer pushes: refresh offers when one arrives, open Home when one is tapped. */
function PushRouting() {
  const { status } = useAuth();
  const last = Notifications.useLastNotificationResponse();
  const qc = useQueryClient();

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      if (isOfferPush(n.request.content.data)) void qc.invalidateQueries({ queryKey: keys.offers });
    });
    return () => sub.remove();
  }, [qc]);

  useEffect(() => {
    if (status !== 'signedIn' || !last) return;
    if (isOfferPush(last.notification.request.content.data)) {
      void qc.invalidateQueries({ queryKey: keys.offers });
      router.navigate('/');
      void Notifications.clearLastNotificationResponseAsync();
    }
  }, [last, status, qc]);
  return null;
}

function RootStack() {
  const { status } = useAuth();
  if (status === 'loading') return null;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.foreground, fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status !== 'signedIn'}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [client] = useState(makeClient);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <OnlineProvider>
            <StatusBar style="dark" />
            <PushRouting />
            <RootStack />
          </OnlineProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
