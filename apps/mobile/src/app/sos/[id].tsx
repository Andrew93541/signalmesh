import { router, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';

import { alarmStore, setAlarm } from '@/lib/alarm';
import { outboxStore } from '@/lib/outbox';
import { useStore } from '@/lib/store';
import { linkStore } from '@/lib/sync';
import { describeStatus, statusSteps } from '@/trackmate/sosStatus';
import { Banner, Button, Card, EmptyState, Icon, Screen, Section, Txt } from '@/ui/kit';
import { color, space } from '@/ui/theme';

const CATEGORY_LABEL = { MEDICAL: 'Medical', RESCUE: 'Rescue', GENERAL: 'Other' } as const;
const PRIORITY_LABEL = { HIGH: 'Urgent', MEDIUM: 'Soon', LOW: 'Not urgent' } as const;
const BANNER_TONE = { warning: 'warning', info: 'info', success: 'success', neutral: 'info' } as const;

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function SosStatus() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useStore(outboxStore).find((i) => i.message.message_id === id);
  const alarmOn = useStore(alarmStore);
  const link = useStore(linkStore);

  if (!item) {
    return (
      <Screen>
        <EmptyState icon="error" title="SOS not found" body="It may have been cleared from this phone." action={<Button label="Back" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  const m = item.message;
  const view = describeStatus(item.status, { attempts: item.attempts, acknowledgedBy: item.acknowledgedBy });
  const steps = statusSteps({
    status: item.status, createdAt: m.created_at, sentAt: item.sentAt,
    acknowledgedBy: item.acknowledgedBy, acknowledgedAt: item.acknowledgedAt,
  }, time);
  const waiting = item.status === 'QUEUED' || item.status === 'CREATED';

  return (
    <Screen>
      <View accessibilityLiveRegion="polite">
        <Banner tone={BANNER_TONE[view.tone]} icon={view.icon} title={view.title} body={view.body} />
      </View>

      {waiting && link.state !== 'online' ? (
        <Txt v="footnote" c={color.text2}>
          Your phone keeps this message and tries again every few seconds while TrackMate is open.
        </Txt>
      ) : null}

      <Section title="Progress">
        <Card>
          {steps.map((step, i) => (
            <View key={step.label} style={{ flexDirection: 'row', gap: space.m }}
              accessible accessibilityLabel={`${step.label}: ${step.done ? 'done' : 'not yet'}${step.detail ? `, ${step.detail}` : ''}`}>
              <View style={{ alignItems: 'center', width: 28 }}>
                <View style={{
                  width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: step.done ? color.success : color.bg, borderWidth: step.done ? 0 : 2, borderColor: color.borderStrong,
                }}>
                  {step.done ? <Icon name="check" sf="checkmark" size={18} tint="#FFFFFF" /> : null}
                </View>
                {i < steps.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: step.done ? color.success : color.border }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: space.l, gap: 2 }}>
                <Txt v="headline" c={step.done ? color.text : color.text2}>{step.label}</Txt>
                {step.detail ? <Txt v="footnote" c={color.text2}>{step.detail}</Txt> : null}
              </View>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="What was sent">
        <Card>
          <Txt v="body">{CATEGORY_LABEL[m.category]} · {PRIORITY_LABEL[m.priority]}</Txt>
          <Txt v="footnote" c={color.text2}>
            {m.latitude !== null && m.longitude !== null
              ? `Location attached: ${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}`
              : 'No location attached: your phone had no location when the SOS was created.'}
          </Txt>
          <Txt v="caption" c={color.text3}>Reference {m.message_id.slice(0, 12)}… · {item.attempts} send attempt{item.attempts === 1 ? '' : 's'}</Txt>
        </Card>
      </Section>

      <Button label={alarmOn ? 'Stop alarm' : 'Sound local alarm'} kind={alarmOn ? 'destructive' : 'secondary'} icon="alarm" onPress={() => setAlarm(!alarmOn)} />
      <Button label="Call 112" kind="secondary" icon="call" onPress={() => void Linking.openURL('tel:112')} />
    </Screen>
  );
}
