import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { useNow } from '@/components/sm';
import { useStore } from '@/lib/store';
import { formatDistance, formatDuration, MAX_ACCURACY_M } from '@/trackmate/geo';
import { deleteJourney, formatDate, journeysStore, type Journey } from '@/trackmate/journeys';
import { elapsedMs, pauseTracking, startTracking, stopTracking, trackingStore, trackSummary } from '@/trackmate/tracking';
import { Banner, Button, Card, EmptyState, Icon, Row, Screen, Section, StatTile, Txt } from '@/ui/kit';
import { color, space } from '@/ui/theme';

const STATUS_TEXT = { PLANNED: 'Planned', ACTIVE: 'Tracking now', PAUSED: 'Paused', COMPLETED: 'Completed' } as const;

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
}

function LiveTracking({ journey, now }: { journey: Journey; now: number }) {
  const t = useStore(trackingStore);
  const fix = t.journeyId === journey.id ? t.lastFix : null;
  const paused = journey.status === 'PAUSED';
  const hasDistance = journey.distanceM > 0;

  return (
    <>
      <View style={{ flexDirection: 'row', gap: space.m }}>
        <StatTile label={paused ? 'Time (paused)' : 'Time'} value={formatDuration(elapsedMs(journey, now))} />
        <StatTile
          label="Distance"
          value={hasDistance ? formatDistance(journey.distanceM) : '—'}
          hint={hasDistance ? undefined : 'Counts once GPS is accurate and you move'}
        />
      </View>

      {!paused && t.journeyId === journey.id ? (
        t.gps === 'denied' ? (
          <Banner tone="critical" icon="location_off" title="Location is off for TrackMate" body={t.error ?? undefined} />
        ) : t.gps === 'error' ? (
          <Banner tone="critical" icon="error" title="GPS stopped working" body={t.error ?? 'Try pausing and resuming tracking.'} />
        ) : t.gps === 'waiting' ? (
          <Banner tone="info" icon="my_location" title="Looking for GPS…" body="This can take a minute. Open sky helps." />
        ) : t.gps === 'poor' && fix ? (
          <Banner tone="warning" icon="location_on" title={`Weak GPS signal (±${Math.round(fix.accuracy ?? 0)} m)`}
            body={`Distance is paused until accuracy is better than ±${MAX_ACCURACY_M} m.`} />
        ) : null
      ) : null}

      {fix ? (
        <Card>
          <Row
            icon="my_location"
            title="Current location"
            subtitle={`${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)} · ±${Math.round(fix.accuracy ?? 0)} m · ${ago(now - fix.at)}`}
            onPress={() => void Linking.openURL(`geo:${fix.latitude},${fix.longitude}?q=${fix.latitude},${fix.longitude}`)}
          />
          {/* Altitude is not shown: Android GPS altitude is height above the WGS84
              ellipsoid, not sea level (tens of metres off in India). Needs an
              MSL source (geoid model or Android 14+ MSL altitude) before display. */}
        </Card>
      ) : null}

      <Txt v="footnote" c={color.text2}>
        Keep TrackMate open while tracking. Recording in the background is coming in a later update.
      </Txt>
    </>
  );
}

export default function JourneyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const journey = useStore(journeysStore).find((j) => j.id === id);
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!journey) {
    return (
      <Screen>
        <EmptyState icon="error" title="Journey not found" body="It may have been deleted." action={<Button label="Back to journeys" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  const trek = journey.type === 'TREK';
  const tracking = journey.status === 'ACTIVE' || journey.status === 'PAUSED';

  async function start() {
    setBusy(true);
    setProblem(await startTracking(journey!.id));
    setBusy(false);
  }

  function confirmStop() {
    Alert.alert('Finish this journey?', 'Tracking stops and the journey moves to your history.', [
      { text: 'Keep tracking', style: 'cancel' },
      { text: 'Finish', onPress: () => stopTracking(journey!.id) },
    ]);
  }

  function confirmDelete() {
    Alert.alert('Delete this journey?', 'Its details and any recorded route on this phone will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteJourney(journey!.id); router.back(); } },
    ]);
  }

  const summary = journey.status === 'COMPLETED' ? trackSummary(journey.id) : null;

  return (
    <Screen>
      <Stack.Screen options={{ title: trek ? 'Trek' : 'Trip' }} />
      <View style={{ gap: space.s }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <Icon name={trek ? 'hiking' : 'luggage'} size={20} tint={color.primary} />
          <Txt v="footnote" c={journey.status === 'ACTIVE' ? color.success : color.text2} style={{ fontWeight: '600' }}>
            {STATUS_TEXT[journey.status]}
          </Txt>
        </View>
        <Txt v="title1">{journey.title}</Txt>
        {journey.destination ? <Txt v="body" c={color.text2}>{journey.destination}</Txt> : null}
      </View>

      {tracking ? <LiveTracking journey={journey} now={now} /> : null}

      {summary ? (
        <Section title="Summary">
          <View style={{ flexDirection: 'row', gap: space.m }}>
            <StatTile label="Tracked time" value={formatDuration(journey.elapsedMs)} />
            <StatTile label="Distance" value={journey.distanceM > 0 ? formatDistance(journey.distanceM) : '—'}
              hint={journey.distanceM > 0 ? undefined : 'No reliable movement recorded'} />
          </View>
          <Txt v="footnote" c={color.text2}>
            {summary.total === 0
              ? 'No GPS points were recorded.'
              : `${summary.accepted} of ${summary.total} GPS points were accurate enough to count.`}
            {journey.startedAt ? ` Started ${new Date(journey.startedAt).toLocaleString()}.` : ''}
            {journey.endedAt ? ` Finished ${new Date(journey.endedAt).toLocaleString()}.` : ''}
          </Txt>
        </Section>
      ) : null}

      {problem ? <Banner tone="warning" icon="warning" title={problem} /> : null}

      {journey.status === 'PLANNED' ? (
        <Button label={trek ? 'Start trek' : 'Start tracking'} icon="play_arrow" onPress={start} loading={busy} />
      ) : null}
      {journey.status === 'ACTIVE' ? (
        <View style={{ flexDirection: 'row', gap: space.m }}>
          <View style={{ flex: 1 }}><Button label="Pause" kind="secondary" icon="pause" onPress={() => pauseTracking(journey.id)} /></View>
          <View style={{ flex: 1 }}><Button label="Finish" kind="secondary" icon="stop" onPress={confirmStop} /></View>
        </View>
      ) : null}
      {journey.status === 'PAUSED' ? (
        <View style={{ flexDirection: 'row', gap: space.m }}>
          <View style={{ flex: 1 }}><Button label="Resume" icon="play_arrow" onPress={start} loading={busy} /></View>
          <View style={{ flex: 1 }}><Button label="Finish" kind="secondary" icon="stop" onPress={confirmStop} /></View>
        </View>
      ) : null}

      <Card>
        <Row icon="calendar_today" title={formatDate(journey.startDate)}
          subtitle={journey.endDate && journey.endDate !== journey.startDate ? `Until ${formatDate(journey.endDate)}` : 'Single day'} />
        <Row icon="timer" title="Safety check-in"
          subtitle={journey.checkinMinutes
            ? `Every ${journey.checkinMinutes < 60 ? `${journey.checkinMinutes} min` : `${journey.checkinMinutes / 60} h`} — starts when you start tracking`
            : 'Off'} />
      </Card>

      {journey.notes ? (
        <Section title="Notes">
          <Txt v="body">{journey.notes}</Txt>
        </Section>
      ) : null}

      {!tracking ? <Button label="Delete journey" kind="destructive" icon="delete" onPress={confirmDelete} /> : null}
    </Screen>
  );
}
