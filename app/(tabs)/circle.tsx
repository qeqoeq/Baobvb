// World is now the default home at /(tabs).
// This redirect preserves backward compatibility for any deep-linked /(tabs)/circle URLs.
import { Redirect } from 'expo-router';

export default function CircleRedirect() {
  return <Redirect href="/(tabs)" />;
}
