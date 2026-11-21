import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ensureLocationPermission } from '@/lib/location';
import { startRelay } from '@/lib/relay';
import { getSettings } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { startSync } from '@/lib/sync';
import { prefsStore } from '@/trackmate/prefs';
import { resumeActiveTracking } from '@/trackmate/tracking';
import { color } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: color.bg, card: color.bg, text: color.text, border: color.border, primary: color.primary },
};

export default function RootLayout() {
  const { mode } = useStore(prefsStore);

  useEffect(() => {
    // SignalMesh starts regardless of onboarding: a queued SOS must keep retrying.
    startSync(); // retry loop for queued SOS, check-ins and ack polling
    void ensureLocationPermission(); // ask up front so an SOS never waits on a permission prompt
    if (getSettings().relayEnabled) void startRelay(); // a relay phone resumes relaying after a restart
    resumeActiveTracking(); // a journey left ACTIVE keeps recording when the app reopens
  }, []);

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="dark" />
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: color.text, headerTitleStyle: { fontWeight: '600' } }}>
        <Stack.Protected guard={mode !== null}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="journey/new" options={{ title: 'New journey', presentation: 'modal' }} />
          <Stack.Screen name="journey/[id]" options={{ title: 'Journey' }} />
          <Stack.Screen name="sos/[id]" options={{ title: 'Your SOS' }} />
          <Stack.Screen name="contacts/index" options={{ title: 'Trusted contacts' }} />
          <Stack.Screen name="contacts/new" options={{ title: 'Add contact', presentation: 'modal' }} />
          <Stack.Screen name="sos-history" options={{ title: 'SOS history' }} />
          <Stack.Screen name="relay" options={{ title: 'Help others' }} />
          <Stack.Screen name="connection" options={{ title: 'Connection settings' }} />
        </Stack.Protected>
        <Stack.Protected guard={mode === null}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
