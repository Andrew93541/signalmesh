import { Alert, View } from 'react-native';

import { Button, C, Card, Screen, StatusBadge, T } from '@/components/sm';
import { clearOutbox, outboxStore } from '@/lib/outbox';
import { useStore } from '@/lib/store';

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString() : '—');

export default function StatusScreen() {
  const outbox = useStore(outboxStore);

  function confirmClear() {
    Alert.alert('Clear SOS history?', 'Deletes every SOS stored on this phone, including unsent ones.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearOutbox },
    ]);
  }

  return (
    <Screen>
      <T size={24} bold>SOS history</T>
      {outbox.length === 0 ? <T muted>No SOS sent from this phone yet.</T> : null}

      {outbox.map(({ message: m, ...item }) => (
        <Card key={m.message_id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T bold>{m.category} · {m.priority}</T>
            <StatusBadge status={item.status} />
          </View>
          <T muted mono size={12}>{m.message_id}</T>
          <T muted size={13}>Created {time(m.created_at)} · Left phone {time(item.sentAt)}</T>
          <T muted size={13}>
            {m.latitude != null ? `GPS ${m.latitude.toFixed(5)}, ${m.longitude?.toFixed(5)}` : 'No GPS fix'}
          </T>
          <T muted size={13}>Attempts: {item.attempts}</T>
          {item.lastError && item.status === 'QUEUED' ? <T color={C.warn} size={13}>Last error: {item.lastError}</T> : null}
          {item.acknowledgedBy ? (
            <T color={C.ok} size={13}>Acknowledged by {item.acknowledgedBy} at {time(item.acknowledgedAt)}</T>
          ) : null}
        </Card>
      ))}

      {outbox.length > 0 ? <Button label="Clear history" onPress={confirmClear} /> : null}
    </Screen>
  );
}
