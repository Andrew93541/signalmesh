import * as Location from 'expo-location';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Nearby } from '../../../modules/signalmesh-nearby';

import { FRESHNESS_TEXT, alertFreshness, distanceM, formatDistance } from '@/lib/alertFormat';
import { useStore } from '@/lib/store';
import { alertsStore, refreshAlerts } from '@/lib/sosAlerts';
import { Banner, Button, Card, Icon, Row, Screen, Txt } from '@/ui/kit';
import { color, radius, space } from '@/ui/theme';

const CATEGORY: Record<string, string> = { MEDICAL: 'Medical emergency', RESCUE: 'Needs rescue', GENERAL: 'Emergency' };
const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

export default function SosAlertScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const alerts = useStore(alertsStore);
  const a = alerts.find((x) => x.message_id === id);
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => { refreshAlerts(); }, [id]);
  useEffect(() => {
    // Distance only: uses the phone's last fix, never sent anywhere.
    Location.getLastKnownPositionAsync().then((p) => p && setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude })).catch(() => {});
  }, []);

  if (!a) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'SOS' }} />
        <Banner tone="warning" icon="info" title="This alert is not on this phone" body="It may have been received on another device." />
      </Screen>
    );
  }

  const fresh = alertFreshness(a);
  const hasFix = fresh !== 'NONE';
  const alerting = a.state === 'ALERTING';
  const name = a.worker_name || 'Someone nearby';

  function acknowledge() {
    Nearby?.acknowledge(a!.message_id); // durable on this phone first; then sent on
    Nearby?.releaseLockScreen();
    refreshAlerts();
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ backgroundColor: alerting ? color.sos : color.sosText, paddingTop: insets.top + space.l, paddingBottom: space.xl, paddingHorizontal: space.l, gap: space.s }}
        accessibilityRole="header" accessibilityLiveRegion="assertive">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <Icon name="emergency" size={32} tint="#fff" />
          <Txt v="title1" c="#fff">SOS EMERGENCY</Txt>
        </View>
        <Txt v="headline" c="#fff">{CATEGORY[a.category ?? 'GENERAL'] ?? 'Emergency'} · {a.priority === 'HIGH' ? 'Critical' : a.priority === 'MEDIUM' ? 'Urgent' : 'Not urgent'}</Txt>
      </View>

      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: color.sosSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="title1" c={color.sosText}>{name.slice(0, 1).toUpperCase()}</Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="title2">{name}</Txt>
            <Txt v="footnote" c={color.text2}>needs help · received {time(a.received_at)}</Txt>
          </View>
        </View>

        {a.state === 'ACKNOWLEDGED' ? (
          <Banner tone={a.ack_state === 'CONFIRMED' ? 'success' : 'info'} icon="check_circle"
            title={a.ack_state === 'CONFIRMED' ? 'Your acknowledgement reached the safety network' : 'Acknowledged on this phone'}
            body={a.ack_state === 'CONFIRMED' ? `Recorded by the gateway. The siren is off.`
              : 'Saved here. It is passed to nearby phones now and sent to the safety network as soon as there is a connection.'} />
        ) : a.state === 'RESPONDED' ? (
          <Banner tone="success" icon="verified" title={a.responder_status === 'RESOLVED' ? 'This SOS has been resolved' : 'A responder has acknowledged this SOS'}
            body="The safety team is handling it. The siren is off." />
        ) : a.state === 'MUTED' ? (
          <Banner tone="warning" icon="notifications_off" title="Nearby SOS alerts are off on this phone" body="No siren was played. Turn alerts on in Profile → Help others." />
        ) : null}

        <Card>
          <Row icon="location_on" title={hasFix ? `${a.latitude!.toFixed(5)}, ${a.longitude!.toFixed(5)}` : 'No location'}
            subtitle={[FRESHNESS_TEXT[fresh],
              hasFix && a.location_accuracy_m ? `±${Math.round(a.location_accuracy_m)} m` : null,
              hasFix && a.location_recorded_at ? `captured ${time(a.location_recorded_at)}` : null,
              hasFix && me ? formatDistance(distanceM(me, { latitude: a.latitude!, longitude: a.longitude! })) : null].filter(Boolean).join(' · ')} />
          <Row icon="tag" title={a.message_id} subtitle={`Incident ID · sent ${time(a.created_at)} · reached you via ${a.source?.startsWith('mesh') ? 'a nearby phone' : 'the Wi-Fi relay'}`} />
          {a.description ? <Row icon="notes" title={a.description} /> : null}
        </Card>
        {fresh === 'LAST_KNOWN' ? (
          <Banner tone="warning" icon="history" title="Not a live location" body="This is the sender's last known position. They may have moved." />
        ) : null}

        {alerting || a.state === 'MUTED' ? (
          <Button label="ACKNOWLEDGE SOS" icon="check_circle" onPress={acknowledge} />
        ) : null}
        <Button kind="secondary" icon="map" label="VIEW LOCATION" disabled={!hasFix}
          onPress={() => void Linking.openURL(`geo:${a.latitude},${a.longitude}?q=${a.latitude},${a.longitude}(SOS ${encodeURIComponent(name)})`)} />
        {a.sender_phone ? (
          <Button kind="secondary" icon="call" label="CALL SENDER" onPress={() => void Linking.openURL(`tel:${a.sender_phone}`)} />
        ) : (
          <Txt v="footnote" c={color.text2} center>Calling is not available: the sender did not share a phone number.</Txt>
        )}

        <View style={{ backgroundColor: color.surface, borderRadius: radius.m, padding: space.m, flexDirection: 'row', gap: space.s }}>
          <Icon name="info" size={18} tint={color.text2} />
          <Txt v="footnote" c={color.text2} style={{ flex: 1 }}>
            Acknowledging tells the sender and the safety team that you saw this alert. It does not replace calling emergency services if someone is in danger.
          </Txt>
        </View>
        {!alerting ? <Button kind="tertiary" label="Close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : null}
      </Screen>
    </View>
  );
}
