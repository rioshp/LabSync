import { Redirect } from 'expo-router';

// Keep the previous authenticated URL valid after upgrading the app.
export default function HomeRoute() {
  return <Redirect href="/jadwal" />;
}
