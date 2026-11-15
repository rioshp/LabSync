import { Link } from 'expo-router';

import { AuthScreen, authStyles } from './auth-screen';

export function FeaturePending({ title }: { title: string }) {
  return (
    <AuthScreen title={title} description="Fitur ini belum tersedia.">
      <Link href="/jadwal" replace style={authStyles.link}>Kembali ke jadwal</Link>
    </AuthScreen>
  );
}
