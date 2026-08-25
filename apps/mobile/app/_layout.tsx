import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { fontAssets } from '../src/lib/fonts';
import { initObservability } from '../src/lib/observability';
import { ThemeProvider, useTheme } from '../src/lib/theme';

// Error tracking (Sentry). Dormant until EXPO_PUBLIC_SENTRY_DSN is set, so this
// is a no-op in local dev and any build without the DSN.
initObservability();

// Hold the native splash until SN Pro is ready so text never flashes in the
// system font. `preventAutoHideAsync` rejects harmlessly if already hidden.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // Font-load failures fall through to the system font rather than blocking
  // the app; `fontError` is surfaced by expo-font in dev.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}

/**
 * Inside the provider so the status bar and the stack background follow the
 * active scheme live — a theme change re-renders this, no reload involved.
 */
function ThemedRoot() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.ground },
        }}
      />
    </>
  );
}
