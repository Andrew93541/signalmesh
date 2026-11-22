import { useState } from 'react';

import { isHttpsUrl } from '@/lib/backoff';
import { gateway, gatewayAt } from '@/lib/gateway';
import { netStore } from '@/lib/network';
import { saveSettings, settingsStore } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { ROUTE_LABEL, linkStore, syncNow } from '@/lib/sync';
import { prefsStore, savePrefs } from '@/trackmate/prefs';
import { Banner, Button, Card, Screen, Section, SettingField, SwitchRow, Txt } from '@/ui/kit';
import { color } from '@/ui/theme';

type TestResult = { ok: boolean; text: string } | null;

export default function ConnectionSettings() {
  const settings = useStore(settingsStore);
  const link = useStore(linkStore);
  const prefs = useStore(prefsStore);
  const net = useStore(netStore);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult>(null);

  async function testConnection(which: 'local' | 'online' = 'local') {
    setTesting(true);
    setResult(null);
    try {
      await (which === 'online' ? gatewayAt(settings.onlineGatewayUrl) : gateway).health();
      setResult({ ok: true, text: 'The safety station answered. SOS messages can be delivered.' });
    } catch (e) {
      setResult({ ok: false, text: `Could not reach it (${e instanceof Error ? e.message : String(e)}). Check the address and that both devices are on the same network.` });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Screen>
      <Section title="You">
        <SettingField label="Your name" value={settings.workerName}
          hint="Shown to responders with your SOS."
          onSave={(v) => saveSettings({ workerName: v || 'Worker' })} />
        <Card>
          <SwitchRow title="Let nearby TrackMate users call me during an SOS"
            subtitle="Adds your account phone number to your SOS so people near you can tap Call. Anyone nearby with TrackMate can see it. Off by default."
            value={settings.shareCallNumber} onChange={(v) => saveSettings({ shareCallNumber: v })} />
        </Card>
      </Section>

      <Section title="Safety station">
        <Banner
          tone={link.state === 'online' ? 'success' : 'warning'}
          icon={link.state === 'online' ? 'wifi' : 'wifi_off'}
          title={link.state === 'online' && link.route ? `Connected · ${ROUTE_LABEL[link.route]}`
            : link.state === 'simulated_offline' ? 'Offline test mode is on'
            : link.state === 'not_configured' ? 'No address set up' : 'Not connected'}
          body={link.state === 'online' ? undefined : [link.error, link.nextRetryAt ? 'Retrying automatically with backoff.' : null].filter(Boolean).join(' ') || undefined}
        />
        <Txt v="footnote" c={color.text2}>
          Phone network: {net.type ?? 'unknown'}{net.connected === false ? ' (not connected)' : ''}{net.internet === true ? ', internet available' : net.internet === false ? ', no internet' : ''}
        </Txt>
        <SettingField
          label="Online gateway (internet)"
          value={settings.onlineGatewayUrl}
          placeholder="https://gateway.example.org"
          hint="Used first when this phone has internet. Must start with https://. Leave empty to use only the local network."
          onSave={(v) => {
            if (v && !isHttpsUrl(v)) { setOnlineError('The online gateway must use https://'); return; }
            setOnlineError(null); saveSettings({ onlineGatewayUrl: v }); syncNow();
          }}
        />
        {onlineError ? <Banner tone="critical" icon="error" title={onlineError} /> : null}
        {settings.onlineGatewayUrl ? <Button label="Test online gateway" kind="secondary" icon="public" onPress={() => testConnection('online')} loading={testing} /> : null}
        <SettingField
          label="Local network address (offline mode)"
          value={settings.gatewayUrl}
          placeholder="http://<station or relay phone IP>:8000"
          hint="The station laptop, or a nearby phone that is helping others, on the same Wi-Fi or hotspot. Used when there is no internet."
          onSave={(v) => { saveSettings({ gatewayUrl: v }); syncNow(); }}
        />
        <Button label="Test local address" kind="secondary" icon="wifi" onPress={() => testConnection('local')} loading={testing} />
        {result ? <Banner tone={result.ok ? 'success' : 'critical'} icon={result.ok ? 'check_circle' : 'error'} title={result.ok ? 'Connected' : 'Not reachable'} body={result.text} /> : null}
      </Section>

      <Section title="Check-in">
        <SettingField label="Default check-in interval (minutes)" numeric value={String(settings.checkinMinutes)}
          hint="Journeys can set their own interval."
          onSave={(v) => saveSettings({ checkinMinutes: Math.max(1, parseInt(v, 10) || 15) })} />
      </Section>

      <Section title="Testing">
        <Card>
          <SwitchRow
            title="Offline test mode"
            subtitle="Pretend there is no connection. SOS messages stay saved on the phone and are sent when you switch this off."
            value={settings.simulateNoSignal}
            onChange={(v) => { saveSettings({ simulateNoSignal: v }); syncNow(); }}
          />
        </Card>
      </Section>

      <Section title="Account server">
        <SettingField
          label="Account server address"
          value={prefs.backendUrl}
          placeholder="https://api.example.org"
          hint="Used for sign-in and your account. SOS does not depend on it."
          onSave={(v) => savePrefs({ backendUrl: v })}
        />
      </Section>

      <Section title="Advanced">
        <SettingField label="Device ID" value={settings.deviceId}
          hint="Identifies this phone to the safety station. Must be different on every phone."
          onSave={(v) => saveSettings({ deviceId: v || 'MOBILE_01' })} />
        <Txt v="footnote" c={color.text3}>Relay port {settings.relayPort}</Txt>
      </Section>
    </Screen>
  );
}
