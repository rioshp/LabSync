import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'LabSync',
  slug: config.slug ?? 'mobile-app-ppk',
  plugins: [...(config.plugins ?? []), '@maplibre/maplibre-react-native'],
});
