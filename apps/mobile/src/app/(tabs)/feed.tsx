import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/lib/store';
import { ApiError, sessionStore } from '@/trackmate/auth';
import { savePrefs } from '@/trackmate/prefs';
import { getFeed, getUnread, type Post } from '@/trackmate/social';
import { EventsPanel } from '@/ui/EventsPanel';
import { Banner, Button, EmptyState, Icon, Txt } from '@/ui/kit';
import { PostCard } from '@/ui/PostCard';
import { color, radius, space } from '@/ui/theme';

type Tab = 'discover' | 'following' | 'events';
const TABS: [Tab, string][] = [['discover', 'Discover'], ['following', 'Following'], ['events', 'Events']];

function Header({ tab, setTab, signedIn, unread }: { tab: Tab; setTab: (t: Tab) => void; signedIn: boolean; unread: number }) {
  return (
    <View style={{ paddingHorizontal: space.l, gap: space.m, paddingBottom: space.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt v="title1" style={{ flex: 1 }}>Feed</Txt>
        {signedIn ? (
          <Pressable onPress={() => router.push('/messages')} accessibilityRole="button" accessibilityLabel={`Messages${unread ? `, ${unread} unread` : ''}`}
            hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: space.xs }}>
            <Icon name="chat_bubble_outline" size={26} tint={color.text} />
            {unread ? (
              <View style={{ position: 'absolute', top: 4, right: 2, backgroundColor: color.accent, borderRadius: radius.full, minWidth: 18, paddingHorizontal: 4, alignItems: 'center' }}>
                <Txt v="caption" c="#fff" style={{ fontWeight: '800', fontSize: 11, lineHeight: 16 }}>{unread > 9 ? '9+' : unread}</Txt>
              </View>
            ) : null}
          </Pressable>
        ) : null}
        {signedIn ? (
          <Pressable onPress={() => router.push('/post/new')} accessibilityRole="button" accessibilityLabel="Create a post"
            style={{ backgroundColor: color.primary, borderRadius: radius.full, paddingHorizontal: space.l, height: 40, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Icon name="add_a_photo" size={20} tint={color.onPrimary} />
            <Txt v="headline" c={color.onPrimary}>Post</Txt>
          </Pressable>
        ) : null}
      </View>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: color.surface, borderRadius: radius.full, padding: 4 }}>
        {TABS.map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}
            style={{ flex: 1, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === k ? color.primary : 'transparent' }}>
            <Txt v="headline" c={tab === k ? color.onPrimary : color.text2}>{l}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function Feed() {
  const insets = useSafeAreaInsets();
  const { session } = useStore(sessionStore);
  const [tab, setTab] = useState<Tab>('discover');
  const [posts, setPosts] = useState<Post[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<{ loading: boolean; error: string | null; loadedFor: string | null }>({ loading: false, error: null, loadedFor: null });
  const [tick, setTick] = useState(0);
  const loadingMore = useRef(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async (scope: 'discover' | 'following', before?: string | null) => {
    if (!sessionStore.get().session) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const p = await getFeed(scope, before);
      setPosts((cur) => (before ? [...cur, ...p.items.filter((x) => !cur.some((c) => c.id === x.id))] : p.items));
      setNext(p.next_before);
      setState({ loading: false, error: null, loadedFor: scope });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof ApiError ? e.message : 'Could not load the feed.' }));
    }
  }, []);

  useEffect(() => { if (tab !== 'events') void load(tab); }, [tab, load, tick]);
  useFocusEffect(useCallback(() => {
    setTick((t) => t + 1);
    if (sessionStore.get().session) void getUnread().then((r) => setUnread(r.unread), () => {});
  }, []));

  const update = (id: string) => (p: Post | null) => setPosts((cur) => (p ? cur.map((x) => (x.id === id ? p : x)) : cur.filter((x) => x.id !== id)));

  const header = <View style={{ paddingTop: insets.top + space.l }}><Header tab={tab} setTab={setTab} signedIn={!!session} unread={unread} /></View>;

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        {header}
        <View style={{ padding: space.l }}>
          <EmptyState icon="group" title="Join the TrackMate community" body="Sign in to see trip posts, follow trekkers and share your own photos and videos."
            action={<Button label="Sign in or create an account" onPress={() => savePrefs({ guest: false })} />} />
        </View>
      </View>
    );
  }

  if (tab === 'events') {
    return (
      <FlatList style={{ flex: 1, backgroundColor: color.bg }} data={[]} renderItem={() => null}
        ListHeaderComponent={<>{header}<EventsPanel tick={tick} /></>}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={<RefreshControl refreshing={false} colors={[color.primary]} onRefresh={() => setTick((t) => t + 1)} />} />
    );
  }

  const shown = state.loadedFor === tab ? posts : [];
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: color.bg }}
      data={shown}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <PostCard p={item} onChanged={update(item.id)} />}
      ListHeaderComponent={<>
        {header}
        {state.error ? <View style={{ paddingHorizontal: space.l, paddingBottom: space.m }}><Banner tone="critical" icon="cloud_off" title="Couldn't load the feed" body={state.error} /></View> : null}
      </>}
      ListEmptyComponent={state.loading || state.loadedFor !== tab ? (
        <Txt v="callout" c={color.text2} center style={{ padding: space.xl }}>Loading…</Txt>
      ) : state.error ? undefined : (
        <View style={{ padding: space.l }}>
          <EmptyState icon={tab === 'following' ? 'person_add' : 'photo_camera'}
            title={tab === 'following' ? 'No posts from people you follow' : 'No posts yet'}
            body={tab === 'following' ? 'Follow trekkers from their posts in Discover to see their trips here.' : 'Be the first to share a trek: tap Post to add photos or a short video.'}
            action={tab === 'discover' ? <Button label="Create a post" icon="add_a_photo" onPress={() => router.push('/post/new')} /> : <Button kind="secondary" label="Go to Discover" onPress={() => setTab('discover')} />} />
        </View>
      )}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (next && !loadingMore.current) {
          loadingMore.current = true;
          void load(tab, next).finally(() => { loadingMore.current = false; });
        }
      }}
      refreshControl={<RefreshControl refreshing={state.loading && shown.length > 0} colors={[color.primary]} onRefresh={() => void load(tab)} />}
      contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
    />
  );
}
