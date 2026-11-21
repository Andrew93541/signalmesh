import { router } from 'expo-router';
import { View } from 'react-native';

import { settingsStore } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { MODE_LABEL, prefsStore, setMode, type Mode } from '@/trackmate/prefs';
import { Card, Chip, Icon, Row, Screen, Section, Txt, s } from '@/ui/kit';
import { color, space } from '@/ui/theme';

export default function Profile() {
  const { mode } = useStore(prefsStore);
  const settings = useStore(settingsStore);

  return (
    <Screen tab>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.l }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="title1" c={color.primary}>{settings.workerName.slice(0, 1).toUpperCase()}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="title1">{settings.workerName}</Txt>
          <Txt v="footnote" c={color.text2}>Device {settings.deviceId} · No account yet</Txt>
        </View>
      </View>

      <Section title="Mode">
        <View style={s.wrap} accessibilityRole="radiogroup">
          {(['TOURIST', 'TREKKER'] as Mode[]).map((m) => (
            <Chip key={m} label={MODE_LABEL[m]} icon={m === 'TREKKER' ? 'hiking' : 'luggage'} selected={mode === m} onPress={() => setMode(m)} />
          ))}
        </View>
        <Txt v="footnote" c={color.text2}>Changes what Home shows first. Your journeys and safety settings stay the same.</Txt>
      </Section>

      <Section title="Safety">
        <Card>
          <Row icon="history" title="SOS history" subtitle="Every SOS sent from this phone" onPress={() => router.push('/sos-history')} />
          <Row icon="cell_tower" title="Help others" subtitle="Pass nearby people's SOS messages on" onPress={() => router.push('/relay')} />
          <Row icon="settings" title="Connection settings" subtitle="Name, device ID, safety station address" onPress={() => router.push('/connection')} />
        </Card>
      </Section>

      <Section title="About">
        <Card tone="surface">
          <View style={{ flexDirection: 'row', gap: space.m }}>
            <Icon name="info" tint={color.text2} />
            <Txt v="footnote" c={color.text2} style={{ flex: 1 }}>
              TrackMate is not an emergency service. It helps you ask for help and share where you are, but it cannot guarantee a response.
              Fitness, co-travellers and plans are coming in later updates.
            </Txt>
          </View>
        </Card>
      </Section>
    </Screen>
  );
}
