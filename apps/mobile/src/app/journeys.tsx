import { router } from 'expo-router';
import { View } from 'react-native';

import { useStore } from '@/lib/store';
import { formatDate, journeysStore, todayLocal, type Journey } from '@/trackmate/journeys';
import { prefsStore } from '@/trackmate/prefs';
import { Button, Card, EmptyState, Icon, Screen, Section, Txt } from '@/ui/kit';
import { color, space } from '@/ui/theme';

const STATUS_TEXT: Record<Journey['status'], [string, string]> = {
  ACTIVE: ['Tracking now', color.success],
  PAUSED: ['Paused', color.warningText],
  PLANNED: ['Planned', color.text2],
  COMPLETED: ['Completed', color.text2],
};

function JourneyCard({ j }: { j: Journey }) {
  const [label, tint] = STATUS_TEXT[j.status];
  return (
    <Card onPress={() => router.push({ pathname: '/journey/[id]', params: { id: j.id } })} label={`${j.title}, ${label}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <Icon name={j.type === 'TREK' ? 'hiking' : 'luggage'} size={20} tint={color.primary} />
        <Txt v="footnote" c={tint} style={{ fontWeight: '600', flex: 1 }}>{label}</Txt>
        <Icon name="chevron_right" sf="chevron.right" size={20} tint={color.text3} />
      </View>
      <Txt v="headline">{j.title}</Txt>
      <Txt v="footnote" c={color.text2}>
        {[j.destination, formatDate(j.startDate) + (j.endDate && j.endDate !== j.startDate ? ` → ${formatDate(j.endDate)}` : '')].filter(Boolean).join(' · ')}
      </Txt>
    </Card>
  );
}

export default function Journeys() {
  const journeys = useStore(journeysStore);
  const { mode } = useStore(prefsStore);
  const today = todayLocal();

  const active = journeys.filter((j) => j.status === 'ACTIVE' || j.status === 'PAUSED');
  const upcoming = journeys.filter((j) => j.status === 'PLANNED' && (j.endDate ?? j.startDate) >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = journeys.filter((j) => j.status === 'COMPLETED' || (j.status === 'PLANNED' && (j.endDate ?? j.startDate) < today));

  const newJourney = () => router.push({ pathname: '/journey/new', params: { type: mode === 'TREKKER' ? 'TREK' : 'TRIP' } });

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt v="title1">Journeys</Txt>
        <Button label="New" icon="add" compact onPress={newJourney} />
      </View>

      {journeys.length === 0 ? (
        <EmptyState
          icon="route"
          title="No journeys yet"
          body="Plan a trip or a trek: where you're going, when, and how often you'll check in."
          action={<Button label="Plan a journey" icon="add" onPress={newJourney} />}
        />
      ) : null}

      {active.length ? <Section title="Active">{active.map((j) => <JourneyCard key={j.id} j={j} />)}</Section> : null}
      {upcoming.length ? <Section title="Upcoming">{upcoming.map((j) => <JourneyCard key={j.id} j={j} />)}</Section> : null}
      {past.length ? <Section title="Past">{past.map((j) => <JourneyCard key={j.id} j={j} />)}</Section> : null}
    </Screen>
  );
}
