import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="relation/archived" options={{ title: 'Relations archivees' }} />
    </Stack>
  );
}