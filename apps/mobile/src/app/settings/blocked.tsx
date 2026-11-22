import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { ApiError } from '@/trackmate/auth';
import { getBlocked, setBlock, type PublicUser } from '@/trackmate/social';
import { Banner, Button, EmptyState, Screen, Txt } from '@/ui/kit';
import { Avatar } from '@/ui/PostCard';
import { color, space } from '@/ui/theme';

export default function Blocked() {
  const [list, setList] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getBlocked().then(setList, (e) => setError(e instanceof ApiError ? e.message : 'Could not load.')); }, []);
  if (error) return <Screen><Banner tone="critical" icon="error" title={error} /></Screen>;
  if (!list) return <Screen><Txt c={color.text2}>Loading…</Txt></Screen>;
  return (
    <Screen>
      {list.length === 0 ? <EmptyState icon="block" title="No one is blocked" body="Block someone from their post or profile menu." /> : null}
      {list.map((u) => (
        <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <Avatar u={u} size={40} />
          <Txt v="headline" style={{ flex: 1 }}>{u.name}</Txt>
          <Button compact kind="secondary" label="Unblock" onPress={() => void setBlock(u.id, false).then(
            () => setList((l) => (l ?? []).filter((x) => x.id !== u.id)), (e) => Alert.alert(e instanceof ApiError ? e.message : 'Failed'))} />
        </View>
      ))}
    </Screen>
  );
}
