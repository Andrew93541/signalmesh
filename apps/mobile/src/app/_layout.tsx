import { DarkTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { ensureLocationPermission } from '@/lib/location';
import { startRelay } from '@/lib/relay';
import { getSettings } from '@/lib/settings';
import { startSync } from '@/lib/sync';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  useEffect(() => {
    startSync(); // retry loop for queued SOS, check-ins and ack polling
    void ensureLocationPermission(); // ask up front so an SOS never waits on a permission prompt
    if (getSettings().relayEnabled) void startRelay(); // a relay phone resumes relaying after a restart
  }, []);

  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
