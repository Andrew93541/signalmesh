import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { ApiError } from '@/trackmate/auth';
import { DIFFICULTY_LABEL, formatDuration, formatPrice, formatWhen, getEvent, seatsText, type TmEvent } from '@/trackmate/events';
import { Cover, StatusBadge } from '@/ui/EventCard';
import { Banner, Button, Card, Row, Screen, Section, Txt } from '@/ui/kit';
import { color, radius, space } from '@/ui/theme';

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<{ id: string; e?: TmEvent; error?: string }>({ id: '' });

  useEffect(() => {
    let live = true;
    getEvent(id).then(
      (e) => live && setState({ id, e }),
      (err) => live && setState({ id, error: err instanceof ApiError ? (err.status === 404 ? 'This event is no longer available.' : err.message) : 'Could not load this event.' }),
    );
    return () => { live = false; };
  }, [id]);

  const e = state.id === id ? state.e : undefined;
  if (!e) {
    return (
      <Screen>
        {state.id === id && state.error ? <Banner tone="critical" icon="error" title={state.error} /> : <Txt c={color.text2}>Loading…</Txt>}
      </Screen>
    );
  }
  const own = e.organizer_contact !== undefined; // the server only sends this to the organizer
  const duration = formatDuration(e.duration_minutes);

  return (
    <Screen>
      <Stack.Screen options={{ title: e.category.label }} />
      <View style={{ borderRadius: radius.l, overflow: 'hidden', marginHorizontal: -space.xs }}>
        <Cover e={e} height={200} />
      </View>
      <View style={{ gap: space.s }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <Txt v="caption" c={color.accentText} style={{ fontWeight: '700', textTransform: 'uppercase', flex: 1 }}>
            {[e.category.label, e.difficulty ? DIFFICULTY_LABEL[e.difficulty] : null].filter(Boolean).join(' · ')}
          </Txt>
          {own ? <StatusBadge status={e.status} /> : null}
        </View>
        <Txt v="title1">{e.title}</Txt>
        <Txt v="callout" c={color.text2}>Organized by {e.organizer.name}</Txt>
      </View>

      {own && e.status_reason ? <Banner tone="warning" icon="feedback" title="Reviewer's note" body={e.status_reason} /> : null}

      <Card>
        <Row icon="event" title={formatWhen(e.start_at)} subtitle={[e.end_at ? `Ends ${formatWhen(e.end_at)}` : null, duration].filter(Boolean).join(' · ') || undefined} />
        <Row icon="location_on" title={e.start_location || 'Meeting point to be announced'} subtitle={e.destination ? `To ${e.destination}` : undefined} />
        <Row icon="group" title={seatsText(e)} subtitle={e.participant_limit ? `${e.seats_taken} accepted so far` : undefined} />
        <Row icon="payments" title={formatPrice(e.price_minor, e.currency)} />
      </Card>

      {e.start_lat !== null && e.start_lon !== null ? (
        <Button kind="secondary" icon="map" label="Open meeting point in Maps"
          onPress={() => void Linking.openURL(`geo:${e.start_lat},${e.start_lon}?q=${e.start_lat},${e.start_lon}(${encodeURIComponent(e.title)})`)} />
      ) : null}

      {e.description ? (
        <Section title="About">
          <Txt>{e.description}</Txt>
        </Section>
      ) : null}
      {e.requirements ? (
        <Section title="What you need">
          <Txt>{e.requirements}</Txt>
        </Section>
      ) : null}
      {own ? (
        <Section title="Organizer contact (only you see this here)">
          <Txt>{e.organizer_contact || 'Not set'}</Txt>
        </Section>
      ) : null}

      {!own ? (
        <Banner tone="info" icon="info" title="Applying opens in a coming update"
          body="The organizer's contact details are shared with participants once they are accepted." />
      ) : null}
    </Screen>
  );
}
