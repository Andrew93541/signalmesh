// Press-and-hold SOS button (DESIGN_SYSTEM.md § 4–5).
// Hold for HOLD_MS to send; releasing early cancels with no side effects.
// Screen-reader users trigger it with the standard activate gesture (double-tap).

import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';

import { Txt } from './kit';
import { color } from './theme';

export const HOLD_MS = 1500;
const SIZE = 200;

export function SosButton({ onSend, busy }: { onSend: () => void; busy?: boolean }) {
  const [progress] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function start() {
    if (busy) return;
    setHolding(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    progress.setValue(0);
    if (!reduceMotion) {
      Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: true }).start();
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      progress.setValue(0);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onSend();
    }, HOLD_MS);
  }

  function cancel() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
    progress.stopAnimation();
    progress.setValue(0);
  }

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <Pressable
        onPressIn={start}
        onPressOut={cancel}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Send SOS"
        accessibilityHint="Press and hold to send an emergency message with your location"
        accessibilityState={{ busy: !!busy }}
        accessibilityActions={[{ name: 'activate', label: 'Send SOS' }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && !busy && onSend()}
        style={{
          width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: color.sos,
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden', opacity: busy ? 0.6 : 1,
        }}>
        {/* Fill grows from the centre while holding */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: '#8E1A12',
            transform: [{ scale: progress }],
          }}
        />
        <Txt v="display" c="#FFFFFF" style={{ fontSize: 44, lineHeight: 52, fontWeight: '800', letterSpacing: 2 }}>SOS</Txt>
      </Pressable>
      <Txt v="callout" c={color.text2} center>
        {busy ? 'Saving your message…' : holding ? 'Keep holding…' : 'Press and hold to send'}
      </Txt>
    </View>
  );
}
