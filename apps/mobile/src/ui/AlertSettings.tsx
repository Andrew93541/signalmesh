import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, View } from 'react-native';

import { Nearby, type AlertStatus } from '../../modules/signalmesh-nearby';

import { useStore } from '@/lib/store';
import { alertsStore } from '@/lib/sosAlerts';

import { Banner, Button, Card, Chip, Row, SwitchRow, Txt, s } from './kit';
import { color, space } from './theme';

const VOLUMES: [number, string][] = [[0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']];
const STATE_TEXT = { ALERTING: 'Alerting now', ACKNOWLEDGED: 'You acknowledged', RESPONDED: 'Responder acted', MUTED: 'Received (alerts were off)' } as const;

/** Settings and honest setup warnings for receiving nearby SOS alerts. */
export function AlertSettings() {
  const [st, setSt] = useState<AlertStatus | null>(() => Nearby?.alertStatus() ?? null);
  const alerts = useStore(alertsStore);
  const refresh = useCallback(() => setSt(Nearby?.alertStatus() ?? null), []);
  useFocusEffect(useCallback(() => {
    refresh();
    const sub = AppState.addEventListener('change', (a) => a === 'active' && refresh()); // back from Android settings
    return () => sub.remove();
  }, [refresh]));

  const N = Nearby;
  if (!N || !st) return <Banner tone="warning" icon="info" title="Alerts need the latest TrackMate build" />;
  const save = (p: Partial<Pick<AlertStatus, 'alertsEnabled' | 'volume' | 'vibrate'>>) => {
    const n = { ...st, ...p };
    N.setAlertPrefs(n.alertsEnabled, n.volume, n.vibrate, n.sound, n.notify);
    refresh();
  };

  return (
    <View style={{ gap: space.m }}>
      <Card>
        <SwitchRow title="Alert me when someone nearby sends an SOS"
          subtitle="A siren, vibration and a pop-up when an SOS reaches this phone over the nearby mesh or Wi-Fi relay."
          value={st.alertsEnabled} onChange={(v) => save({ alertsEnabled: v })} />
        <SwitchRow title="Vibrate with the siren" value={st.vibrate} onChange={(v) => save({ vibrate: v })} />
      </Card>
      <Txt v="headline">Siren volume</Txt>
      <View style={s.wrap} accessibilityRole="radiogroup">
        {VOLUMES.map(([v, l]) => <Chip key={l} label={l} selected={Math.abs(st.volume - v) < 0.05} onPress={() => save({ volume: v })} />)}
      </View>
      <Txt v="footnote" c={color.text2}>Relative to your phone&apos;s alarm volume. TrackMate never changes system volume.</Txt>
      <Button kind="secondary" icon="volume_up" label="Test siren (3 seconds)" onPress={() => N.testSiren()} />

      {!st.notificationsEnabled || !st.channelEnabled ? (
        <Banner tone="critical" icon="notifications_off" title="Notifications are off for TrackMate"
          body="You will not get a notification or siren for nearby SOS. Only the in-app pop-up appears while TrackMate is open." />
      ) : null}
      {!st.notificationsEnabled || !st.channelEnabled ? <Button label="Open notification settings" onPress={() => N.openNotificationSettings()} /> : null}
      {st.notificationsEnabled && !st.canFullScreen ? (
        <Banner tone="warning" icon="fullscreen_exit" title="Full-screen alerts are not allowed"
          body="On a locked phone you will get a heads-up notification instead of the full-screen alert. You can allow full-screen alerts in Android settings." />
      ) : null}
      {st.notificationsEnabled && !st.canFullScreen ? <Button kind="secondary" label="Allow full-screen alerts" onPress={() => N.openFullScreenSettings()} /> : null}
      {st.dndActive ? (
        <Banner tone="warning" icon="do_not_disturb_on" title="Do Not Disturb is on"
          body="TrackMate respects it: nearby SOS arrive as a silent notification, with no siren or vibration, until you turn Do Not Disturb off." />
      ) : null}
      <Txt v="caption" c={color.text2}>
        Android may still stop background apps to save battery. A siren on this phone does not prove anyone heard it.
      </Txt>

      {alerts.length ? (
        <Card>
          {alerts.slice(0, 10).map((a) => (
            <Row key={a.message_id} icon="emergency" title={`${a.worker_name ?? 'Someone'} · ${a.category ?? 'SOS'}`}
              subtitle={`${STATE_TEXT[a.state]}${a.ack_state ? (a.ack_state === 'CONFIRMED' ? ' · confirmed by server' : ' · saved on this phone') : ''} · ${new Date(a.received_at).toLocaleString()}`}
              onPress={() => router.push({ pathname: '/sos-alert/[id]', params: { id: a.message_id } })} />
          ))}
        </Card>
      ) : null}
    </View>
  );
}
