// In-app splash: the full logo (the native Android 12+ splash would clip it to a
// circle, so the native splash is only the background colour). Fades out once the
// app has loaded, after at least MIN_MS so it doesn't flash.

import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, StyleSheet, View } from 'react-native';

import { Txt } from './kit';
import { Logo } from './Logo';
import { color, space } from './theme';

const MIN_MS = 900;
const FADE_MS = 300;

export function BrandSplash({ ready }: { ready: boolean }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [shownAt] = useState(() => Date.now());
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_MS - (Date.now() - shownAt));
    const t = setTimeout(async () => {
      const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      Animated.timing(opacity, { toValue: 0, duration: reduce ? 0 : FADE_MS, useNativeDriver: true })
        .start(() => setVisible(false));
    }, wait);
    return () => clearTimeout(t);
  }, [ready, opacity, shownAt]);

  if (!visible) return null;
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: color.bg, opacity, alignItems: 'center', justifyContent: 'center', gap: space.xl, zIndex: 10 }]}
      onLayout={() => void SplashScreen.hideAsync()}
      accessibilityLabel="TrackMate is loading"
      accessible>
      <Logo size={240} />
      <View style={{ alignItems: 'center', gap: space.xs }}>
        <Txt v="title2" c={color.primary}>TrackMate</Txt>
        <Txt v="callout" c={color.text2}>Travel and trek with confidence</Txt>
      </View>
      <ActivityIndicator color={color.primary} />
    </Animated.View>
  );
}
