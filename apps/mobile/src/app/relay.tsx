import { Alert, Switch, View } from 'react-native';

import { Button, C, Card, LinkBanner, Screen, T } from '@/components/sm';
import { clearRelayQueue, relayStore, startRelay, stopRelay, type RelayItemState } from '@/lib/relay';
import { saveSettings, settingsStore } from '@/lib/settings';
import { useStore } from '@/lib/store';

const STATE_TEXT: Record<RelayItemState, [string, string]> = {
  PENDING: ['Waiting for gateway', C.warn],
  FORWARDED: ['Forwarded', C.ok],
  REJECTED: ['Rejected by gateway', C.sos],
};

export default function RelayScreen() {
  const settings = useStore(settingsStore);
  const relay = useStore(relayStore);
  const waiting = relay.items.filter((i) => i.state === 'PENDING').length;
  const forwarded = relay.items.filter((i) => i.state === 'FORWARDED').length;

  function toggle(on: boolean) {
    saveSettings({ relayEnabled: on });
    if (on) void startRelay();
    else stopRelay();
  }

  function confirmClear() {
    Alert.alert('Clear relay queue?', 'Messages not yet forwarded will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearRelayQueue },
    ]);
  }

  return (
    <Screen>
      <T size={24} bold>Relay</T>
      <T muted>
        Let nearby phones send their SOS through this phone. It stores each message and passes it on to the gateway.
        Keep this phone plugged in with the app open.
      </T>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T bold>Relay mode</T>
            <T muted size={13}>Node ID {settings.deviceId}</T>
          </View>
          <Switch accessibilityLabel="Relay mode" value={settings.relayEnabled} onValueChange={toggle} />
        </View>
      </Card>

      {relay.error ? (
        <Card>
          <T bold color={C.sos}>Relay could not start</T>
          <T muted>{relay.error}</T>
        </Card>
      ) : null}

      {relay.running ? (
        <Card>
          <T muted size={13}>Other phones should send to</T>
          <T size={20} bold mono>{`http://${relay.address ?? '<this phone IP>'}:${relay.port}`}</T>
          <T muted size={13}>On the sender phone: Settings → Next hop URL.</T>
        </Card>
      ) : null}

      <T muted size={12} bold>THIS RELAY&apos;S NEXT HOP: {settings.gatewayUrl}</T>
      <LinkBanner />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[
          ['Received', relay.items.length],
          ['Waiting', waiting],
          ['Forwarded', forwarded],
        ].map(([label, n]) => (
          <View key={label} style={{ flex: 1 }}>
            <Card>
              <T size={24} bold>{n}</T>
              <T muted size={12}>{label}</T>
            </Card>
          </View>
        ))}
      </View>
      {relay.pendingCheckins > 0 ? <T color={C.warn}>{relay.pendingCheckins} check-in(s) waiting for the gateway</T> : null}

      {relay.items.length === 0 ? (
        <T muted>No messages relayed yet.</T>
      ) : (
        relay.items.map((i) => {
          const [text, color] = STATE_TEXT[i.state];
          return (
            <Card key={i.message.message_id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T bold>{i.message.category} · {i.message.priority}</T>
                <T color={color} size={13} bold>{text}</T>
              </View>
              <T muted mono size={12}>{i.message.message_id}</T>
              <T muted size={13}>Path: {i.message.hops.join(' → ')}</T>
              <T muted size={13}>
                From {i.from ?? 'unknown'} at {new Date(i.receivedAt).toLocaleTimeString()}
                {i.nextStatus ? ` · gateway says ${i.nextStatus}` : ''}
              </T>
              {i.lastError && i.state !== 'FORWARDED' ? <T color={C.warn} size={13}>{i.lastError}</T> : null}
            </Card>
          );
        })
      )}

      {relay.items.length > 0 ? <Button label="Clear relay queue" onPress={confirmClear} /> : null}
    </Screen>
  );
}
