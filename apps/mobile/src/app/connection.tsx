import { useState } from 'react';

import { gateway } from '@/lib/gateway';
import { saveSettings, settingsStore } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { linkStore, syncNow } from '@/lib/sync';
import { Banner, Button, Card, Screen, Section, SettingField, SwitchRow, Txt } from '@/ui/kit';
import { color } from '@/ui/theme';

type TestResult = { ok: boolean; text: string } | null;

export default function ConnectionSettings() {
  const settings = useStore(settingsStore);
  const link = useStore(linkStore);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult>(null);

  async function testConnection() {
    setTesting(true);
    setResult(null);
    try {
      await gateway.health();
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
      </Section>

      <Section title="Safety station">
        <Banner
          tone={link.state === 'online' ? 'success' : 'warning'}
          icon={link.state === 'online' ? 'wifi' : 'wifi_off'}
          title={link.state === 'online' ? 'Connected' : link.state === 'simulated_offline' ? 'Offline test mode is on' : 'Not connected'}
          body={link.state === 'online' ? undefined : link.error ?? undefined}
        />
        <SettingField
          label="Safety station address"
          value={settings.gatewayUrl}
          placeholder="http://192.168.1.10:8000"
          hint="The station laptop, or a nearby phone that is helping others. Your organizer gives you this address."
          onSave={(v) => { saveSettings({ gatewayUrl: v }); syncNow(); }}
        />
        <Button label="Test connection" kind="secondary" icon="wifi" onPress={testConnection} loading={testing} />
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

      <Section title="Advanced">
        <SettingField label="Device ID" value={settings.deviceId}
          hint="Identifies this phone to the safety station. Must be different on every phone."
          onSave={(v) => saveSettings({ deviceId: v || 'MOBILE_01' })} />
        <Txt v="footnote" c={color.text3}>Relay port {settings.relayPort}</Txt>
      </Section>
    </Screen>
  );
}
