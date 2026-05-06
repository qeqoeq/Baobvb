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
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Bao' }} />
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
