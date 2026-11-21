import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { ensureLocationPermission } from '@/lib/location';
import { startRelay } from '@/lib/relay';
import { getSettings } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { initMesh } from '@/lib/mesh';
import { startSync } from '@/lib/sync';
import { restoreSession, sessionStore } from '@/trackmate/auth';
import { prefsStore } from '@/trackmate/prefs';
import { resumeActiveTracking } from '@/trackmate/tracking';
import { BrandSplash } from '@/ui/BrandSplash';
import { color } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: color.bg, card: color.bg, text: color.text, border: color.border, primary: color.primary },
};

export default function RootLayout() {
  const { mode, onboardingDone, guest } = useStore(prefsStore);
  const { ready, session } = useStore(sessionStore);

  useEffect(() => {
    // SignalMesh starts regardless of onboarding or sign-in: a queued SOS must keep retrying.
    startSync(); // retry loop for queued SOS, check-ins and ack polling
    // Ask up front so an SOS never waits on a permission prompt; then the nearby mesh
    // (its Bluetooth prompt must not overlap the location one).
    void ensureLocationPermission().finally(initMesh);
    if (getSettings().relayEnabled) void startRelay(); // a relay phone resumes relaying after a restart
    resumeActiveTracking(); // a journey left ACTIVE keeps recording when the app reopens
    void restoreSession();
  }, []);

  const signedIn = !!session || guest;

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        {ready ? (
          <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: color.text, headerTitleStyle: { fontWeight: '700' }, headerStyle: { backgroundColor: color.bg }, contentStyle: { backgroundColor: color.bg } }}>
            <Stack.Protected guard={!onboardingDone}>
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            </Stack.Protected>

            <Stack.Protected guard={onboardingDone && !signedIn}>
              <Stack.Screen name="auth/login" options={{ headerShown: false }} />
              <Stack.Screen name="auth/register" options={{ title: 'Create account' }} />
              <Stack.Screen name="auth/forgot" options={{ title: 'Reset password' }} />
              <Stack.Screen name="legal/consent" options={{ title: 'Step 2 of 2' }} />
            </Stack.Protected>

            <Stack.Protected guard={onboardingDone && signedIn && mode === null}>
              <Stack.Screen name="welcome" options={{ headerShown: false }} />
            </Stack.Protected>

            <Stack.Protected guard={onboardingDone && signedIn && mode !== null}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="journey/new" options={{ title: 'New journey', presentation: 'modal' }} />
              <Stack.Screen name="journey/[id]" options={{ title: 'Journey' }} />
              <Stack.Screen name="sos/[id]" options={{ title: 'Your SOS' }} />
              <Stack.Screen name="contacts/index" options={{ title: 'Trusted contacts' }} />
              <Stack.Screen name="contacts/new" options={{ title: 'Add contact', presentation: 'modal' }} />
              <Stack.Screen name="sos-history" options={{ title: 'SOS history' }} />
              <Stack.Screen name="relay" options={{ title: 'Help others' }} />
              <Stack.Screen name="connection" options={{ title: 'Connection settings' }} />
              <Stack.Screen name="profile/edit" options={{ title: 'Edit profile' }} />
              <Stack.Screen name="profile/contact" options={{ title: 'Emergency contact', presentation: 'modal' }} />
              <Stack.Screen name="profile/change" options={{ title: 'Change sign-in details' }} />
              <Stack.Screen name="profile/password" options={{ title: 'Change password' }} />
            </Stack.Protected>

            {/* Always reachable */}
            <Stack.Screen name="legal/terms" options={{ title: 'Terms' }} />
            <Stack.Screen name="legal/privacy" options={{ title: 'Privacy' }} />
          </Stack>
        ) : null}
        <BrandSplash ready={ready} />
      </View>
    </ThemeProvider>
  );
}
