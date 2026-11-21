import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';

import { useNow } from '@/components/sm';
import { alarmStore, setAlarm } from '@/lib/alarm';
import { checkIn, checkinStore, msUntilDue } from '@/lib/checkin';
import { CATEGORIES, DEFAULT_PRIORITY, PRIORITIES, type Category, type Priority } from '@/lib/contract';
import { ensureLocationPermission, getFix } from '@/lib/location';
import { meshStore } from '@/lib/mesh';
import { createSos, outboxStore } from '@/lib/outbox';
import { settingsStore } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { ROUTE_LABEL, linkStore, syncNow } from '@/lib/sync';
import { sessionStore } from '@/trackmate/auth';
import { contactsStore } from '@/trackmate/contacts';
import { describeStatus, isOpen } from '@/trackmate/sosStatus';
import { Banner, Button, Card, Chip, Row, Screen, Section, Txt, s } from '@/ui/kit';
import { SosButton } from '@/ui/SosButton';
import { color } from '@/ui/theme';

const CATEGORY_LABEL: Record<Category, string> = { MEDICAL: 'Medical', RESCUE: 'Rescue', GENERAL: 'Other' };
const CATEGORY_ICON = { MEDICAL: 'medical_services', RESCUE: 'crisis_alert', GENERAL: 'help' } as const;
const PRIORITY_LABEL: Record<Priority, string> = { HIGH: 'Urgent', MEDIUM: 'Soon', LOW: 'Not urgent' };
const TONE = { warning: 'warning', info: 'primary', success: 'success', neutral: 'surface' } as const;

function minutes(ms: number) {
  const m = Math.max(0, Math.round(Math.abs(ms) / 60000));
  return m < 1 ? 'less than a minute' : m === 1 ? '1 minute' : `${m} minutes`;
}

export default function Safety() {
  const settings = useStore(settingsStore);
  const outbox = useStore(outboxStore);
  const checkin = useStore(checkinStore);
  const alarmOn = useStore(alarmStore);
  const link = useStore(linkStore);
  const mesh = useStore(meshStore);
  const contacts = useStore(contactsStore);
  const now = useNow(10_000);

  const [category, setCategory] = useState<Category>('MEDICAL');
  const [priority, setPriority] = useState<Priority>('HIGH');
  const [sending, setSending] = useState(false);
  const [locationOn, setLocationOn] = useState<boolean | null>(null);

  useFocusEffect(useCallback(() => {
    void Location.getForegroundPermissionsAsync().then((p) => setLocationOn(p.status === 'granted')).catch(() => setLocationOn(false));
  }, []));

  const latest = outbox[0];
  const showLatest = latest && isOpen(latest.status);
  const dueIn = msUntilDue(checkin.lastCheckinAt, settings.checkinMinutes, now);

  // Same flow as before the redesign: fix (≤3 s) → save to the outbox → sync now.
  async function sendSos() {
    if (sending) return;
    setSending(true);
    try {
      const { unavailableReason: _reason, ...fix } = await getFix();
      const account = sessionStore.get().session?.user;
      const message = createSos({
        category, priority, ...fix,
        user_id: account?.id ?? null,
        worker_name: account?.full_name,
      }); // saved locally before any network call
      syncNow();
      router.push({ pathname: '/sos/[id]', params: { id: message.message_id } });
    } finally {
      setSending(false);
    }
  }

  async function onCheckIn() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await checkIn();
    syncNow();
  }

  const view = latest ? describeStatus(latest.status, { attempts: latest.attempts, acknowledgedBy: latest.acknowledgedBy }) : null;

  return (
    <Screen tab>
      <Txt v="title1">Safety</Txt>

      {showLatest && view ? (
        <Card tone={TONE[view.tone]} onPress={() => router.push({ pathname: '/sos/[id]', params: { id: latest.message.message_id } })}
          label={`Your latest SOS: ${view.title}. Open details.`}>
          <Txt v="footnote" c={color.text2} style={{ fontWeight: '600' }}>Your latest SOS</Txt>
          <Txt v="headline">{view.title}</Txt>
          <Txt v="footnote" c={color.text}>{view.body}</Txt>
        </Card>
      ) : null}

      <Section>
        <Txt v="title2" center>Need emergency help?</Txt>
        <SosButton onSend={sendSos} busy={sending} />
      </Section>

      <Section title="What kind of help?">
        <View style={s.wrap} accessibilityRole="radiogroup">
          {CATEGORIES.map((c) => (
            <Chip key={c} label={CATEGORY_LABEL[c]} icon={CATEGORY_ICON[c]} selected={c === category}
              onPress={() => { setCategory(c); setPriority(DEFAULT_PRIORITY[c]); }} />
          ))}
        </View>
        <View style={s.wrap} accessibilityRole="radiogroup">
          {PRIORITIES.map((p) => (
            <Chip key={p} label={PRIORITY_LABEL[p]} selected={p === priority} onPress={() => setPriority(p)} />
          ))}
        </View>
      </Section>

      {locationOn === false ? (
        <Banner tone="warning" icon="location_off" title="Location is off"
          body="An SOS will still be sent, but without your location. Turn location on so responders can find you." />
      ) : null}
      {locationOn === false ? (
        <Button label="Turn on location" kind="secondary" icon="my_location"
          onPress={() => void ensureLocationPermission().then(setLocationOn)} />
      ) : null}
      {link.state === 'online' && link.route ? (
        <Txt v="footnote" c={color.text2} style={{ textAlign: 'center' }}>Sending via {ROUTE_LABEL[link.route]}</Txt>
      ) : link.state !== 'checking' && mesh.peers.length ? (
        <Banner tone="info" icon="bluetooth" title={`No signal · ${mesh.peers.length} nearby phone${mesh.peers.length === 1 ? '' : 's'} connected`}
          body="An SOS is passed to nearby TrackMate phones, and the first one with a connection delivers it." />
      ) : link.state !== 'checking' ? (
        <Banner tone="warning" icon="wifi_off" title={link.state === 'not_configured' ? 'No safety station set up' : 'No connection right now'}
          body={`An SOS is saved on your phone first and sent automatically as soon as a connection is available.${link.nextRetryAt ? ' Retrying automatically.' : ''}`} />
      ) : null}

      <Section title="Check-in">
        <Card>
          <Txt v="footnote" c={color.text2}>
            {dueIn === null ? 'No check-in yet' : dueIn >= 0 ? 'Next check-in due in' : 'Check-in overdue by'}
          </Txt>
          {dueIn !== null ? (
            <Txt v="stat" c={dueIn >= 0 ? color.text : color.sosText}>{minutes(dueIn)}</Txt>
          ) : (
            <Txt v="callout" c={color.text2}>Tap below to start a {settings.checkinMinutes}-minute timer. If you miss a check-in, the safety station is alerted.</Txt>
          )}
          {dueIn !== null && dueIn < 0 ? (
            <Txt v="footnote" c={color.sosText}>The safety station has been told you missed a check-in.</Txt>
          ) : null}
          {checkin.pending ? <Txt v="footnote" c={color.warningText}>Check-in saved on your phone, waiting for a connection.</Txt> : null}
          <Button label="I'm OK" icon="check_circle" onPress={onCheckIn} />
        </Card>
      </Section>

      <Section title="Other help">
        <Card>
          <Row icon="alarm" title={alarmOn ? 'Stop alarm' : 'Sound local alarm'} subtitle="Vibrates so people nearby notice you"
            onPress={() => setAlarm(!alarmOn)} danger={alarmOn} />
          <Row icon="call" title="Call 112" subtitle="India's emergency number. Opens your phone dialer."
            onPress={() => void Linking.openURL('tel:112')} />
          <Row icon="contacts" title="Trusted contacts"
            subtitle={contacts.length === 0 ? 'None yet. Add someone to text after an SOS.' : `${contacts.length} ${contacts.length === 1 ? 'person' : 'people'}`}
            onPress={() => router.push('/contacts')} />
          <Row icon="history" title="SOS history" onPress={() => router.push('/sos-history')} />
        </Card>
      </Section>

      <Txt v="footnote" c={color.text2}>
        TrackMate helps you ask for help and share where you are. It is not an emergency service and cannot guarantee a response.
      </Txt>
    </Screen>
  );
}
