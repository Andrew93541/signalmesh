// Placeholder UI building blocks. Swap these for the real design;
// screens only use them for looks, all behaviour lives in src/lib.

import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LocalStatus } from '@/lib/outbox';
import { useStore } from '@/lib/store';
import { linkStore } from '@/lib/sync';

export const C = {
  bg: '#0B0E13',
  card: '#12161D',
  border: '#252B36',
  text: '#E8ECF2',
  muted: '#8B95A5',
  sos: '#E5483D',
  ok: '#3DDC97',
  warn: '#F5A524',
};

export function Screen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100, gap: 16 }}>
      {children}
    </ScrollView>
  );
}

export function T({ children, muted, size = 15, bold, mono, color }: {
  children: ReactNode; muted?: boolean; size?: number; bold?: boolean; mono?: boolean; color?: string;
}) {
  return (
    <Text style={{
      color: color ?? (muted ? C.muted : C.text),
      fontSize: size,
      fontWeight: bold ? '700' : '400',
      fontFamily: mono ? 'monospace' : undefined,
    }}>
      {children}
    </Text>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[s.chip, active && { backgroundColor: C.text, borderColor: C.text }]}>
      <Text style={{ color: active ? C.bg : C.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Button({ label, onPress, color = C.card, textColor = C.text, disabled }: {
  label: string; onPress: () => void; color?: string; textColor?: string; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[s.button, { backgroundColor: color, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={{ color: textColor, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

const LINK_TEXT = {
  checking: ['Checking link…', C.muted],
  online: ['Connected to next hop', C.ok],
  unreachable: ['No route: SOS will be stored and retried', C.warn],
  simulated_offline: ['Simulated no signal (Settings)', C.warn],
} as const;

export function LinkBanner() {
  const link = useStore(linkStore);
  const [text, color] = LINK_TEXT[link.state];
  return (
    <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <View style={{ flex: 1 }}>
        <T bold>{text}</T>
        {link.error && link.state === 'unreachable' ? <T muted size={12}>{link.error}</T> : null}
      </View>
    </View>
  );
}

const STATUS_COLOR: Record<LocalStatus, string> = {
  QUEUED: C.warn,
  CREATED: C.muted,
  RELAYED: C.warn,
  DELIVERED: '#7FB5FF',
  ACKNOWLEDGED: C.ok,
  RESOLVED: C.muted,
};

export function StatusBadge({ status }: { status: LocalStatus }) {
  return (
    <View style={[s.badge, { borderColor: STATUS_COLOR[status] }]}>
      <Text style={{ color: STATUS_COLOR[status], fontSize: 11, fontWeight: '700' }}>{status}</Text>
    </View>
  );
}

/** Re-renders every `ms` so countdowns tick. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  chip: { paddingHorizontal: 14, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
  button: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  input: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 12, color: C.text, height: 48, paddingHorizontal: 14, fontSize: 15 },
});
