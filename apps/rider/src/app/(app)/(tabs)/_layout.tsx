import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { colors } from '@estene/theme/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon =
  (name: IconName) =>
  ({ color, size }: { color: unknown; size: number }) => (
    <Ionicons name={name} color={color as string} size={size} />
  );

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { color: colors.foreground, fontWeight: '800' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Jobs', tabBarIcon: icon('bicycle') }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: icon('wallet') }} />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: icon('person-circle') }}
      />
    </Tabs>
  );
}
