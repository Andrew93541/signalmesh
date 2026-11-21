import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, C, Card, Chip, LinkBanner, Screen, StatusBadge, T, s, useNow } from '@/components/sm';
import { setAlarm, alarmStore } from '@/lib/alarm';
import { checkIn, checkinStore, msUntilDue } from '@/lib/checkin';
import { CATEGORIES, DEFAULT_PRIORITY, PRIORITIES, type Category, type Priority } from '@/lib/contract';
import { getFix } from '@/lib/location';
import { createSos, outboxStore } from '@/lib/outbox';
import { settingsStore } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { syncNow } from '@/lib/sync';

const HOLD_MS = 1500;

function formatCountdown(ms: number) {
  const total = Math.floor(Math.abs(ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function SosScreen() {
  const settings = useStore(settingsStore);
  const outbox = useStore(outboxStore);
  const checkin = useStore(checkinStore);
  const alarmOn = useStore(alarmStore);
  const now = useNow();

  const [category, setCategory] = useState<Category>('MEDICAL');
  const [priority, setPriority] = useState<Priority>('HIGH');
  const [sending, setSending] = useState(false);

  const latest = outbox[0];
  const dueIn = msUntilDue(checkin.lastCheckinAt, settings.checkinMinutes, now);

  async function sendSos() {
    if (sending) return;
    setSending(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      const fix = await getFix();
      createSos({ category, priority, ...fix }); // saved locally before any network call
      syncNow();
    } finally {
      setSending(false);
    }
  }

  async function onCheckIn() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await checkIn();
    syncNow();
  }

  return (
    <Screen tab>
      <View>
        <T size={24} bold>{settings.workerName}</T>
        <T muted mono size={12}>{settings.deviceId}</T>
      </View>

      <LinkBanner />

      <View style={{ gap: 8 }}>
        <T muted size={12} bold>EMERGENCY TYPE</T>
        <View style={s.row}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={c === category} onPress={() => { setCategory(c); setPriority(DEFAULT_PRIORITY[c]); }} />
          ))}
        </View>
        <T muted size={12} bold>PRIORITY</T>
        <View style={s.row}>
          {PRIORITIES.map((p) => (
            <Chip key={p} label={p} active={p === priority} onPress={() => setPriority(p)} />
          ))}
        </View>
      </View>

      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
        <Pressable
          onLongPress={sendSos}
          delayLongPress={HOLD_MS}
          accessibilityRole="button"
          accessibilityLabel="Send SOS. Press and hold."
          style={({ pressed }) => ({
            width: 190, height: 190, borderRadius: 95,
            backgroundColor: C.sos,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ scale: pressed ? 0.95 : 1 }],
            opacity: sending ? 0.6 : 1,
          })}>
          <Text style={{ color: '#fff', fontSize: 48, fontWeight: '800', letterSpacing: 2 }}>SOS</Text>
        </Pressable>
        <T muted>{sending ? 'Getting location…' : 'Press and hold to send'}</T>
      </View>

      {latest ? (
        <Link href="/sos-history" asChild>
          <Pressable accessibilityRole="link">
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T bold>Latest SOS</T>
                <StatusBadge status={latest.status} />
              </View>
              <T muted mono size={12}>{latest.message.message_id}</T>
              {latest.acknowledgedBy ? <T color={C.ok}>Acknowledged by {latest.acknowledgedBy}</T> : null}
              {latest.status === 'QUEUED' ? <T color={C.warn}>Stored on phone, retrying ({latest.attempts} tries)</T> : null}
            </Card>
          </Pressable>
        </Link>
      ) : null}

      <Card>
        <T muted size={13}>Next safety check-in</T>
        {dueIn === null ? (
          <T>Check in to start your {settings.checkinMinutes}-minute timer</T>
        ) : dueIn >= 0 ? (
          <T size={28} mono>{formatCountdown(dueIn)}</T>
        ) : (
          <T size={20} bold color={C.sos}>Overdue by {formatCountdown(dueIn)}: control room alerted</T>
        )}
        {checkin.pending ? <T muted size={12}>Check-in stored, waiting for a route</T> : null}
        <Button label="I'm OK, check in" color={C.ok} textColor="#FFFFFF" onPress={onCheckIn} />
      </Card>

      <Button
        label={alarmOn ? 'Stop local alarm' : 'Sound local alarm'}
        color={alarmOn ? C.sos : C.card}
        textColor={alarmOn ? '#fff' : C.text}
        onPress={() => setAlarm(!alarmOn)}
      />
    </Screen>
  );
}
