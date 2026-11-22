import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { ApiError } from '@/trackmate/auth';
import { getInbox, timeAgo, type Conversation } from '@/trackmate/social';
import { Banner, EmptyState, Txt } from '@/ui/kit';
import { Avatar } from '@/ui/PostCard';
import { color, radius, space } from '@/ui/theme';

/** Inbox: conversations with people who follow you (or you follow each other). */
export default function Messages() {
  const [list, setList] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    getInbox().then((l) => { setList(l); setError(null); }, (e) => setError(e instanceof ApiError ? e.message : 'Could not load messages.')).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {error ? <View style={{ padding: space.l }}><Banner tone="critical" icon="cloud_off" title={error} /></View> : null}
      <FlatList data={list ?? []} keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={loading} colors={[color.primary]} onRefresh={load} />}
        ListEmptyComponent={list ? (
          <View style={{ padding: space.l }}>
            <EmptyState icon="chat" title="No messages yet" body="You can message people who follow you. Open their profile and tap Message." />
          </View>
        ) : undefined}
        renderItem={({ item: c }) => (
          <Pressable onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id, name: c.other.name } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m }}
            accessibilityLabel={`Conversation with ${c.other.name}${c.unread ? `, ${c.unread} unread` : ''}`}>
            <Avatar u={c.other} size={48} />
            <View style={{ flex: 1 }}>
              <Txt v="headline">{c.other.name}</Txt>
              <Txt v="footnote" c={c.unread ? color.text : color.text2} numberOfLines={1} style={{ fontWeight: c.unread ? '700' : '400' }}>
                {c.last_message ? c.last_message.body : ''}
              </Txt>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Txt v="caption" c={color.text2}>{timeAgo(c.updated_at)}</Txt>
              {c.unread ? (
                <View style={{ backgroundColor: color.accent, borderRadius: radius.full, minWidth: 22, paddingHorizontal: 6, alignItems: 'center' }}>
                  <Txt v="caption" c="#fff" style={{ fontWeight: '800' }}>{c.unread}</Txt>
                </View>
              ) : null}
            </View>
          </Pressable>
        )} />
    </View>
  );
}
