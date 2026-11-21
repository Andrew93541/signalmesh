import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { clearOutbox, outboxStore } from '@/lib/outbox';
import { useStore } from '@/lib/store';
import { describeStatus } from '@/trackmate/sosStatus';
import { Button, Card, EmptyState, Icon, Screen, Txt } from '@/ui/kit';
import { color, radius, space } from '@/ui/theme';

const CATEGORY_LABEL = { MEDICAL: 'Medical', RESCUE: 'Rescue', GENERAL: 'Other' } as const;
const PRIORITY_LABEL = { HIGH: 'Urgent', MEDIUM: 'Soon', LOW: 'Not urgent' } as const;
const PILL = {
  warning: [color.warningSoft, color.warningText],
  info: [color.primarySoft, color.primary],
  success: [color.successSoft, color.success],
  neutral: [color.surface2, color.text2],
} as const;

const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function SosHistory() {
  const outbox = useStore(outboxStore);

  function confirmClear() {
    const unsent = outbox.filter((i) => i.status === 'QUEUED').length;
    Alert.alert(
      'Clear SOS history?',
      unsent > 0
        ? `${unsent} message${unsent > 1 ? 's have' : ' has'} not been sent yet and will be deleted too. This cannot be undone.`
        : 'This removes every SOS record from this phone. It cannot be undone.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: clearOutbox }],
    );
  }

  if (outbox.length === 0) {
    return (
      <Screen>
        <EmptyState icon="history" title="No SOS sent from this phone" body="When you send an SOS, you can follow its progress here." />
      </Screen>
    );
  }

  return (
    <Screen>
      {outbox.map((item) => {
        const m = item.message;
        const v = describeStatus(item.status, { attempts: item.attempts, acknowledgedBy: item.acknowledgedBy });
        const [bg, fg] = PILL[v.tone];
        return (
          <Card key={m.message_id} onPress={() => router.push({ pathname: '/sos/[id]', params: { id: m.message_id } })}
            label={`SOS ${CATEGORY_LABEL[m.category]}, ${when(m.created_at)}: ${v.title}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: bg, borderRadius: radius.full, paddingHorizontal: space.s, paddingVertical: 2 }}>
                <Icon name={v.icon} size={16} tint={fg} />
                <Txt v="caption" c={fg}>{v.pill}</Txt>
              </View>
              <Txt v="footnote" c={color.text2} style={{ flex: 1 }}>{when(m.created_at)}</Txt>
              <Icon name="chevron_right" sf="chevron.right" size={20} tint={color.text3} />
            </View>
            <Txt v="headline">{CATEGORY_LABEL[m.category]} · {PRIORITY_LABEL[m.priority]}</Txt>
            <Txt v="footnote" c={color.text2}>
              {v.title}{m.latitude === null ? ' · No location attached' : ''}
            </Txt>
          </Card>
        );
      })}
      <Button label="Clear history" kind="destructive" icon="delete" onPress={confirmClear} />
    </Screen>
  );
}
