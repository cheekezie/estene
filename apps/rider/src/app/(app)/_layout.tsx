import { Stack } from 'expo-router';
import { colors } from '@estene/theme/tokens';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.foreground, fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ title: 'Job' }} />
    </Stack>
  );
}
