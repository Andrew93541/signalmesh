import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useNow } from '@/components/sm';
import { checkinStore, msUntilDue } from '@/lib/checkin';
import { outboxStore } from '@/lib/outbox';
import { settingsStore } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { ROUTE_LABEL, linkStore, type LinkState } from '@/lib/sync';
import { contactsStore } from '@/trackmate/contacts';
import { formatDate, journeysStore, todayLocal, type Journey } from '@/trackmate/journeys';
import { MODE_LABEL, prefsStore } from '@/trackmate/prefs';
import { Button, Card, Icon, Row, Screen, Section, Txt } from '@/ui/kit';
import { color, radius, space } from '@/ui/theme';

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const LINK: Record<LinkState, { text: string; icon: 'wifi' | 'wifi_off' | 'hourglass_empty'; ok: boolean }> = {
  online: { text: 'Messages can be sent now.', icon: 'wifi', ok: true },
  unreachable: { text: 'An SOS will be saved on your phone and sent when possible.', icon: 'wifi_off', ok: false },
  simulated_offline: { text: 'Offline test mode is on (Profile → Connection settings).', icon: 'wifi_off', ok: false },
  checking: { text: 'Checking connection…', icon: 'hourglass_empty', ok: false },
  not_configured: { text: 'No safety station set up yet (Profile → Connection settings). An SOS is still saved on your phone.', icon: 'wifi_off', ok: false },
};

function minutes(ms: number) {
  const m = Math.round(Math.abs(ms) / 60000);
  return m < 1 ? 'less than a minute' : m === 1 ? '1 minute' : `${m} minutes`;
}

function pickJourney(journeys: Journey[], type: 'TRIP' | 'TREK') {
  const active = journeys.find((j) => j.status === 'ACTIVE' || j.status === 'PAUSED');
  if (active) return { journey: active, active: true };
  const today = todayLocal();
  const upcoming = journeys
    .filter((j) => j.status === 'PLANNED' && (j.endDate ?? j.startDate) >= today)
    .sort((a, b) => (a.type === type ? 0 : 1) - (b.type === type ? 0 : 1) || a.startDate.localeCompare(b.startDate));
  return upcoming[0] ? { journey: upcoming[0], active: false } : null;
}

export default function Home() {
  const { mode } = useStore(prefsStore);
  const settings = useStore(settingsStore);
  const link = useStore(linkStore);
  const checkin = useStore(checkinStore);
  const outbox = useStore(outboxStore);
  const journeys = useStore(journeysStore);
  const contacts = useStore(contactsStore);
  const now = useNow(30_000);

  const trekker = mode === 'TREKKER';
  const type = trekker ? 'TREK' : 'TRIP';
  const featured = pickJourney(journeys, type);
  const waiting = outbox.filter((i) => i.status === 'QUEUED').length;
  const due = msUntilDue(checkin.lastCheckinAt, settings.checkinMinutes, now);
  const l = LINK[link.state];

  return (
    <Screen tab>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m }}>
        <View style={{ flex: 1 }}>
          <Txt v="footnote" c={color.text2}>{greeting(now)}</Txt>
          <Txt v="title1">{settings.workerName}</Txt>
        </View>
        <Pressable
          onPress={() => router.navigate('/profile')}
          accessibilityRole="button"
          accessibilityLabel={`${mode ? MODE_LABEL[mode] : ''} mode. Change in Profile.`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.m, minHeight: 44, borderRadius: radius.full, backgroundColor: color.primarySoft }}>
          <Icon name={trekker ? 'hiking' : 'luggage'} size={18} tint={color.primary} />
          <Txt v="callout" c={color.primary} style={{ fontWeight: '600' }}>{mode ? MODE_LABEL[mode] : ''}</Txt>
        </Pressable>
      </View>

      <Pressable
        onPress={() => router.navigate('/safety')}
        accessibilityRole="button"
        accessibilityLabel="Need emergency help? Open SOS."
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: space.l, padding: space.l, borderRadius: radius.m,
          backgroundColor: pressed ? '#B8222B' : color.sos,
        })}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="headline" c="#FFFFFF" style={{ fontWeight: '800' }}>SOS</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="headline" c="#FFFFFF">Need emergency help?</Txt>
          <Txt v="footnote" c="#FFFFFF">Open SOS</Txt>
        </View>
        <Icon name="chevron_right" sf="chevron.right" tint="#FFFFFF" />
      </Pressable>

      <Section title={trekker ? 'Your trek' : 'Your trip'}
        action={<Button compact kind="tertiary" label="All journeys" onPress={() => router.push('/journeys')} />}>
        {featured ? (
          <Card onPress={() => router.push({ pathname: '/journey/[id]', params: { id: featured.journey.id } })} label={`Open ${featured.journey.title}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
              <Icon name={featured.journey.type === 'TREK' ? 'hiking' : 'luggage'} size={20} tint={color.primary} />
              <Txt v="footnote" c={featured.active ? color.success : color.text2} style={{ fontWeight: '600' }}>
                {featured.active ? (featured.journey.status === 'PAUSED' ? 'Tracking paused' : 'Tracking now') : 'Up next'}
              </Txt>
            </View>
            <Txt v="title2">{featured.journey.title}</Txt>
            <Txt v="callout" c={color.text2}>
              {[featured.journey.destination, formatDate(featured.journey.startDate)].filter(Boolean).join(' · ')}
            </Txt>
          </Card>
        ) : (
          <Card tone="surface">
            <Txt v="headline">{trekker ? 'No trek planned' : 'No trip planned'}</Txt>
            <Txt v="callout" c={color.text2}>
              {trekker ? 'Plan your route, dates and check-in interval before you set off.' : 'Add your destination and dates so the people you trust know your plans.'}
            </Txt>
          </Card>
        )}
        <Button
          label={trekker ? 'Plan a trek' : 'Plan a trip'}
          icon="add"
          kind={featured ? 'secondary' : 'primary'}
          onPress={() => router.push({ pathname: '/journey/new', params: { type } })}
        />
      </Section>

      <Section title="Safety status">
        <Card>
          <Row icon={l.icon} title={l.ok && link.route ? `Connected · ${ROUTE_LABEL[link.route]}` : link.state === 'checking' ? 'Checking' : 'Not connected'} subtitle={l.text} />
          <Row
            icon="timer"
            title="Check-in timer"
            subtitle={due === null ? 'Not started' : due >= 0 ? `Next check-in due in ${minutes(due)}` : `Overdue by ${minutes(due)}`}
            onPress={() => router.navigate('/safety')}
          />
          <Row
            icon="contacts"
            title="Trusted contacts"
            subtitle={contacts.length === 0 ? 'None yet. Add someone you can text after an SOS.' : `${contacts.length} ${contacts.length === 1 ? 'person' : 'people'}`}
            onPress={() => router.push('/contacts')}
          />
          {waiting > 0 ? (
            <Row icon="schedule" title={`${waiting} message${waiting > 1 ? 's' : ''} waiting`} subtitle="Saved on your phone. We'll keep trying to send." onPress={() => router.push('/sos-history')} />
          ) : null}
        </Card>
      </Section>
    </Screen>
  );
}
