import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { ApiError } from '@/trackmate/auth';
import { getPeople, type PublicUser } from '@/trackmate/social';
import { Banner, Txt } from '@/ui/kit';
import { Avatar } from '@/ui/PostCard';
import { color, space } from '@/ui/theme';

type Person = PublicUser & { is_following: boolean; followed_at: string };

/** Followers / following list, paginated. */
export default function People() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: 'followers' | 'following' }>();
  const [items, setItems] = useState<Person[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPeople(id, kind).then((p) => { setItems(p.items); setNext(p.next_before); }, (e) => setError(e instanceof ApiError ? e.message : 'Could not load.'));
  }, [id, kind]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Stack.Screen options={{ title: kind === 'followers' ? 'Followers' : 'Following' }} />
      {error ? <View style={{ padding: space.l }}><Banner tone="critical" icon="cloud_off" title={error} /></View> : null}
      <FlatList data={items ?? []} keyExtractor={(u) => u.id}
        ListEmptyComponent={items ? <Txt v="callout" c={color.text2} center style={{ padding: space.xl }}>{kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</Txt> : undefined}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.s }}>
            <Avatar u={item} size={44} />
            <View style={{ flex: 1 }}>
              <Txt v="headline">{item.name}</Txt>
              {item.username ? <Txt v="footnote" c={color.text2}>@{item.username}</Txt> : null}
            </View>
            {item.is_following ? <Txt v="caption" c={color.text2}>Following</Txt> : null}
          </Pressable>
        )}
        onEndReached={() => {
          if (!next) return;
          const before = next; setNext(null);
          void getPeople(id, kind, before).then((p) => { setItems((c) => [...(c ?? []), ...p.items]); setNext(p.next_before); });
        }} />
    </View>
  );
}
