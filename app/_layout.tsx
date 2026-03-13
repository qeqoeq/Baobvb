import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="me/qr"
        options={{ title: 'My card', presentation: 'modal' }}
      />
      <Stack.Screen
        name="me/scan"
        options={{ title: 'Scan card', presentation: 'modal' }}
      />
      <Stack.Screen
        name="me/edit"
        options={{ title: 'Edit my card', presentation: 'modal' }}
      />
      <Stack.Screen
        name="relation/add"
        options={{ title: 'Add a person', presentation: 'modal' }}
      />
      <Stack.Screen
        name="relation/edit/[id]"
        options={{ title: 'Edit relation', presentation: 'modal' }}
      />
      {/* Places routes are intentionally hidden from MVP navigation; files are kept parked for later. */}
      <Stack.Screen name="relation/[id]" options={{ title: 'Relation' }} />
      <Stack.Screen name="relation/evaluate/[id]" options={{ title: 'Foundational reading' }} />
      <Stack.Screen name="relation/archived" options={{ title: 'Relations archivees' }} />
    </Stack>
  );
}
