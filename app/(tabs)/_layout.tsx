import { Tabs } from 'expo-router';

import { colors } from '../../constants/colors';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        tabBarActiveTintColor: colors.accent.warmGold,
        tabBarInactiveTintColor: colors.text.muted,
        // B32: opaque tab scene — index and garden are both kept mounted by the
        // tab navigator; an opaque backing stops the inactive one bleeding through.
        sceneStyle: { backgroundColor: colors.background.primary },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Liens' }} />
      <Tabs.Screen
        name="garden"
        options={{
          href: null,
        }}
      />
      {/* circle.tsx is a backward-compat redirect — hidden from tab bar */}
      <Tabs.Screen name="circle" options={{ href: null }} />
    </Tabs>
  );
}
