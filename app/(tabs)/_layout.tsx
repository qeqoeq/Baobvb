import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { colors } from '../../constants/colors';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background.primary,
          borderTopColor: colors.border.soft,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 60,
        },
        tabBarActiveTintColor: colors.accent.warmGold,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          paddingBottom: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'World',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="globe-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="garden"
        options={{
          title: 'Garden',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            // Prevent the default tab navigation (which preserves the current route state
            // including any contextual filter params set by World). Always navigate to the
            // Garden root without params so contextual filters don't become sticky defaults.
            e.preventDefault();
            router.navigate('/garden');
          },
        }}
      />
      {/* circle.tsx is a backward-compat redirect — hidden from tab bar */}
      <Tabs.Screen name="circle" options={{ href: null }} />
    </Tabs>
  );
}
