import { Alert, View } from 'react-native';

import { meshStore } from '@/lib/mesh';
import { clearRelayQueue, relayStore, startRelay, stopRelay, type RelayItemState } from '@/lib/relay';
import { saveSettings, settingsStore } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { linkStore } from '@/lib/sync';
import { Banner, Button, Card, Icon, Screen, Section, StatTile, SwitchRow, Txt } from '@/ui/kit';
import { color, space } from '@/ui/theme';

const STATE: Record<RelayItemState, [string, string]> = {
  PENDING: ['Waiting to pass on', color.warningText],
  FORWARDED: ['Passed on', color.success],
  REJECTED: ['Not accepted by the safety station', color.sosText],
};

export default function HelpOthers() {
  const settings = useStore(settingsStore);
  const relay = useStore(relayStore);
  const link = useStore(linkStore);
  const mesh = useStore(meshStore);
  const waiting = relay.items.filter((i) => i.state === 'PENDING').length;
  const forwarded = relay.items.filter((i) => i.state === 'FORWARDED').length;

  // Same calls as before the redesign.
  function toggle(on: boolean) {
    saveSettings({ relayEnabled: on });
    if (on) void startRelay();
    else stopRelay();
  }

  function confirmClear() {
    Alert.alert('Clear relayed messages?', waiting > 0
      ? `${waiting} message${waiting > 1 ? 's are' : ' is'} still waiting to be passed on and will be lost. This cannot be undone.`
      : 'This removes the relay records from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearRelayQueue },
    ]);
  }

  return (
    <Screen>
      <Txt v="body" c={color.text2}>
        Let nearby TrackMate phones send their SOS through this phone. Each message is saved here first, then passed on to the safety station.
      </Txt>

      <Section title="Nearby phones (Bluetooth / Wi-Fi Direct)">
        <Card>
          <SwitchRow title="Nearby mesh"
            subtitle={!mesh.available ? 'Not in this build' : mesh.running ? `On · ${mesh.peers.length} phone${mesh.peers.length === 1 ? '' : 's'} connected` : 'Off'}
            value={settings.meshEnabled} onChange={(on) => saveSettings({ meshEnabled: on })} />
        </Card>
        <Txt v="footnote" c={color.text2}>
          Works with no Wi-Fi, hotspot or signal. Phones with TrackMate open find each other and pass SOS messages along;
          the first phone that gets any connection delivers them to the safety station. Range is roughly a room to a few tens of metres.
        </Txt>
        {mesh.error ? <Banner tone="critical" icon="error" title="Nearby mesh" body={mesh.error} /> : null}
        {mesh.peers.map((p) => (
          <Card key={p.endpointId}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt v="headline">{p.node}</Txt>
              <Txt v="footnote" c={p.online ? color.success : color.text2}>{p.online ? 'Has a connection' : p.online === false ? 'Offline' : 'Connected'}</Txt>
            </View>
          </Card>
        ))}
        {mesh.log.length ? (
          <Card tone="surface">
            {mesh.log.slice(0, 8).map((l, i) => <Txt key={i} v="caption" c={color.text2}>{l}</Txt>)}
          </Card>
        ) : null}
      </Section>

      <Section title="Shared Wi-Fi or hotspot">
      <Card>
        <SwitchRow title="Help others" subtitle={relay.running ? 'On: this phone is passing messages on' : 'Off'}
          value={settings.relayEnabled} onChange={toggle} />
      </Card>
      </Section>

      {relay.error ? <Banner tone="critical" icon="error" title="Could not start" body={relay.error} /> : null}

      {relay.running ? (
        <>
          <Card tone="primary">
            <Txt v="footnote" c={color.text2}>Nearby phones send to</Txt>
            <Txt v="title2" c={color.primary} style={{ fontVariant: ['tabular-nums'] }}>
              {`http://${relay.address ?? 'this phone'}:${relay.port}`}
            </Txt>
            <Txt v="footnote" c={relay.addressSource === 'route' ? color.success : color.warningText}>
              {relay.addressSource === 'route'
                ? 'Address confirmed on the network that reaches the safety station.'
                : 'Address not confirmed: check this phone is on the shared Wi-Fi or hotspot and the safety station address is set.'}
            </Txt>
            <Txt v="footnote" c={color.text}>On the other phone: Profile → Connection settings → Safety station address.</Txt>
          </Card>
          <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'flex-start' }}>
            <Icon name="info" size={18} tint={color.text2} />
            <Txt v="footnote" c={color.text2} style={{ flex: 1 }}>
              Keep this phone plugged in with TrackMate open. This part works over a shared Wi-Fi network or this phone&apos;s hotspot. The nearby mesh above needs no network.
            </Txt>
          </View>
        </>
      ) : null}

      <Section title="Safety station">
        <Banner
          tone={link.state === 'online' ? 'success' : 'warning'}
          icon={link.state === 'online' ? 'wifi' : 'wifi_off'}
          title={link.state === 'online' ? 'Connected' : 'Not connected'}
          body={link.state === 'online'
            ? 'Messages are passed on straight away.'
            : 'Messages are kept on this phone and passed on when the connection returns.'}
        />
        <Txt v="footnote" c={color.text3}>Address: {settings.gatewayUrl}</Txt>
      </Section>

      <Section title="Messages">
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <StatTile label="Received" value={String(relay.items.length)} />
          <StatTile label="Waiting" value={String(waiting)} />
          <StatTile label="Passed on" value={String(forwarded)} />
        </View>
        {relay.pendingCheckins > 0 ? (
          <Txt v="footnote" c={color.warningText}>{relay.pendingCheckins} check-in{relay.pendingCheckins > 1 ? 's' : ''} waiting to be passed on</Txt>
        ) : null}
        {relay.items.length === 0 ? (
          <Txt v="callout" c={color.text2}>No messages relayed yet.</Txt>
        ) : (
          relay.items.map((i) => {
            const [label, tint] = STATE[i.state];
            return (
              <Card key={i.message.message_id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s }}>
                  <Txt v="headline">{i.message.worker_name}</Txt>
                  <Txt v="footnote" c={tint} style={{ fontWeight: '600' }}>{label}</Txt>
                </View>
                <Txt v="footnote" c={color.text2}>
                  Received {new Date(i.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {i.nextStatus ? ` · station says ${i.nextStatus.toLowerCase()}` : ''}
                </Txt>
                <Txt v="caption" c={color.text3}>Path {i.message.hops.join(' → ')}</Txt>
                {i.lastError && i.state !== 'FORWARDED' ? <Txt v="footnote" c={color.warningText}>Last try: {i.lastError}</Txt> : null}
              </Card>
            );
          })
        )}
      </Section>

      {relay.items.length > 0 ? <Button label="Clear relayed messages" kind="destructive" icon="delete" onPress={confirmClear} /> : null}
    </Screen>
  );
}
