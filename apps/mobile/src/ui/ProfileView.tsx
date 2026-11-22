import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, useWindowDimensions, View } from 'react-native';

import { ApiError } from '@/trackmate/auth';
import { getProfile, getUserPosts, mediaSource, openConversation, report, setBlock, setFollow, type Post, type Profile } from '@/trackmate/social';

import { Banner, Button, Icon, Txt } from './kit';
import { Avatar } from './PostCard';
import { color, radius, space } from './theme';

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

function Stat({ n, label, onPress }: { n: number; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${n} ${label}`}
      style={{ alignItems: 'center', flex: 1 }}>
      <Txt v="title2">{n}</Txt>
      <Txt v="footnote" c={color.text2}>{label}</Txt>
    </Pressable>
  );
}

function Tile({ p, size }: { p: Post; size: number }) {
  const first = p.media[0];
  return (
    <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })} accessibilityLabel={p.caption || 'Post'}
      style={{ width: size, height: size, padding: 1 }}>
      {first?.kind === 'IMAGE' ? (
        <Image source={mediaSource(first.id)} style={{ flex: 1, backgroundColor: color.surface }} contentFit="cover" />
      ) : (
        <View style={{ flex: 1, backgroundColor: color.text, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="play_circle" size={36} tint="#fff" />
        </View>
      )}
      {p.media.length > 1 ? <View style={{ position: 'absolute', top: 6, right: 6 }}><Icon name="collections" size={18} tint="#fff" /></View> : null}
    </Pressable>
  );
}

/** Instagram-style profile. Shows only public fields; the server never sends private ones. */
export function ProfileView({ userId, header }: { userId: string; header?: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, list] = await Promise.all([getProfile(userId), getUserPosts(userId)]);
      setProfile(p); setPosts(list.items); setNext(list.next_before); setError(null);
    } catch (e) { setError(msg(e)); } finally { setLoading(false); }
  }, [userId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function toggleFollow() {
    if (!profile) return;
    const on = !profile.is_following;
    setProfile({ ...profile, is_following: on, followers_count: profile.followers_count + (on ? 1 : -1) });
    try { await setFollow(profile.id, on); } catch (e) { setProfile(profile); Alert.alert(msg(e)); }
  }

  function more() {
    if (!profile) return;
    Alert.alert(profile.name, undefined, [
      { text: 'Report profile', onPress: () => void report('USER', profile.id, 'INAPPROPRIATE').then(() => Alert.alert('Thanks, report sent.'), (e) => Alert.alert(msg(e))) },
      { text: 'Block', style: 'destructive', onPress: () => Alert.alert(`Block ${profile.name}?`, 'You will not see each other’s posts or profiles. Unblock any time in Settings.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => void setBlock(profile.id, true).then(() => router.back(), (e) => Alert.alert(msg(e))) },
      ]) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const tile = Math.floor(width / 3);
  const top = (
    <View style={{ gap: space.l, paddingBottom: space.l }}>
      {header}
      {error ? <View style={{ paddingHorizontal: space.l }}><Banner tone="critical" icon="cloud_off" title="Couldn't load this profile" body={error} /></View> : null}
      {profile ? (
        <View style={{ paddingHorizontal: space.l, gap: space.m }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.l }}>
            <Avatar u={profile} size={84} />
            <Stat n={profile.posts_count} label="Posts" />
            <Stat n={profile.followers_count} label="Followers" onPress={() => router.push({ pathname: '/people', params: { id: profile.id, kind: 'followers' } })} />
            <Stat n={profile.following_count} label="Following" onPress={() => router.push({ pathname: '/people', params: { id: profile.id, kind: 'following' } })} />
          </View>
          <View style={{ gap: 2 }}>
            <Txt v="headline">{profile.name}</Txt>
            {profile.username ? <Txt v="footnote" c={color.text2}>@{profile.username}</Txt> : null}
            {profile.bio ? <Txt v="callout">{profile.bio}</Txt> : null}
            {profile.home_location ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="home_pin" size={16} tint={color.text2} />
                <Txt v="footnote" c={color.text2}>{profile.home_location}</Txt>
              </View>
            ) : null}
          </View>
          {profile.interests.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              {profile.interests.map((t) => (
                <View key={t} style={{ backgroundColor: color.accentSoft, borderRadius: radius.full, paddingHorizontal: space.s, paddingVertical: 2 }}>
                  <Txt v="caption" c={color.accentText} style={{ fontWeight: '700' }}>{t}</Txt>
                </View>
              ))}
            </View>
          ) : null}
          {profile.is_me ? (
            <Button kind="secondary" compact icon="edit" label="Edit profile" onPress={() => router.push('/profile/edit')} />
          ) : (
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <View style={{ flex: 1 }}>
                <Button compact kind={profile.is_following ? 'secondary' : 'primary'} label={profile.is_following ? 'Following' : 'Follow'} onPress={toggleFollow} />
              </View>
              {profile.follows_me ? (
                <View style={{ flex: 1 }}>
                  <Button compact kind="secondary" icon="chat" label="Message" onPress={() => void openConversation(profile.id).then(
                    (c) => router.push({ pathname: '/chat/[id]', params: { id: c.id, name: profile.name } }), (e) => Alert.alert(msg(e)))} />
                </View>
              ) : null}
              <Button compact kind="tertiary" icon="more_horiz" label="More" onPress={more} />
            </View>
          )}
        </View>
      ) : null}
      <View style={{ height: 1, backgroundColor: color.border }} />
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: color.bg }}
      data={posts}
      numColumns={3}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <Tile p={item} size={tile} />}
      ListHeaderComponent={top}
      ListEmptyComponent={profile && !loading ? (
        <View style={{ alignItems: 'center', padding: space.xl, gap: space.s }}>
          <Icon name="photo_library" size={40} tint={color.text2} />
          <Txt v="callout" c={color.text2} center>{profile.is_me ? 'Share your first trek: photos and short videos appear here.' : 'No posts yet.'}</Txt>
          {profile.is_me ? <Button compact label="Create a post" icon="add_a_photo" onPress={() => router.push('/post/new')} /> : null}
        </View>
      ) : undefined}
      onEndReached={() => {
        if (!next) return;
        const before = next;
        setNext(null);
        void getUserPosts(userId, before).then((p) => { setPosts((c) => [...c, ...p.items]); setNext(p.next_before); }, () => setNext(before));
      }}
      refreshControl={<RefreshControl refreshing={loading} colors={[color.primary]} onRefresh={() => void load()} />}
      contentContainerStyle={{ paddingBottom: 120 }}
    />
  );
}
