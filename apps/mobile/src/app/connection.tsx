import { useState } from 'react';
import { Switch, TextInput, View } from 'react-native';

import { Button, C, Card, LinkBanner, Screen, T, s } from '@/components/sm';
import { gateway } from '@/lib/gateway';
import { saveSettings, settingsStore } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { syncNow } from '@/lib/sync';

function Field({ label, value, onSave, numeric, hint }: {
  label: string; value: string; onSave: (v: string) => void; numeric?: boolean; hint?: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <View style={{ gap: 6 }}>
      <T muted size={12} bold>{label}</T>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={draft}
        onChangeText={setDraft}
        // Save on every way editing can end: some Android keyboards close on Back
        // without firing onEndEditing, which left the old value in use.
        onEndEditing={() => onSave(draft.trim())}
        onBlur={() => onSave(draft.trim())}
        onSubmitEditing={() => onSave(draft.trim())}
        returnKeyType="done"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={numeric ? 'number-pad' : 'default'}
        placeholderTextColor={C.muted}
      />
      {hint ? <T muted size={12}>{hint}</T> : null}
    </View>
  );
}

export default function SettingsScreen() {
  const settings = useStore(settingsStore);
  const [test, setTest] = useState<string | null>(null);

  async function testConnection() {
    setTest('Testing…');
    try {
      await gateway.health();
      setTest('OK: next hop answered /health');
    } catch (e) {
      setTest(`Failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <Screen>
      <T size={24} bold>Settings</T>
      <LinkBanner />

      <Field
        label="NEXT HOP URL (RELAY OR GATEWAY)"
        value={settings.gatewayUrl}
        onSave={(v) => { saveSettings({ gatewayUrl: v }); syncNow(); }}
        hint="e.g. http://192.168.1.10:8000, the laptop's IP on the shared hotspot"
      />
      <Button label="Test connection" onPress={testConnection} />
      {test ? <T muted>{test}</T> : null}

      <Field label="DEVICE ID" value={settings.deviceId} onSave={(v) => saveSettings({ deviceId: v || 'MOBILE_01' })} />
      <Field label="WORKER NAME" value={settings.workerName} onSave={(v) => saveSettings({ workerName: v || 'Worker' })} />
      <Field
        label="CHECK-IN INTERVAL (MINUTES)"
        value={String(settings.checkinMinutes)}
        numeric
        onSave={(v) => saveSettings({ checkinMinutes: Math.max(1, parseInt(v, 10) || 15) })}
      />

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T bold>Simulate no signal</T>
            <T muted size={13}>Demo switch. SOS messages queue on the phone and send when you turn it off.</T>
          </View>
          <Switch
            accessibilityLabel="Simulate no signal"
            value={settings.simulateNoSignal}
            onValueChange={(v) => { saveSettings({ simulateNoSignal: v }); syncNow(); }}
          />
        </View>
      </Card>
    </Screen>
  );
}
