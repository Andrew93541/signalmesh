import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, useWindowDimensions, View } from 'react-native';

import { ApiError } from '@/trackmate/auth';
import { deletePost, mediaSource, report, setBlock, setLike, timeAgo, userPhotoSource, type Media, type Post, type PublicUser } from '@/trackmate/social';

import { Icon, Txt } from './kit';
import { color, radius, space } from './theme';

export function Avatar({ u, size = 36 }: { u: Pick<PublicUser, 'id' | 'name' | 'has_photo'>; size?: number }) {
  const src = userPhotoSource(u);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      {src ? <Image source={src} style={{ width: size, height: size }} contentFit="cover" />
        : <Txt v={size > 50 ? 'title1' : 'headline'} c={color.primary}>{(u.name || '?').slice(0, 1).toUpperCase()}</Txt>}
    </View>
  );
}

function VideoItem({ m, width }: { m: Media; width: number }) {
  const player = useVideoPlayer(mediaSource(m.id), (p) => { p.loop = true; p.muted = true; });
  return <VideoView player={player} style={{ width, height: width }} contentFit="cover" nativeControls />;
}

export function MediaCarousel({ media, width }: { media: Media[]; width: number }) {
  const [i, setI] = useState(0);
  return (
    <View>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {media.map((m) => m.kind === 'VIDEO'
          ? <VideoItem key={m.id} m={m} width={width} />
          : <Image key={m.id} source={mediaSource(m.id)} style={{ width, height: width, backgroundColor: color.surface }} contentFit="cover" accessibilityLabel="Post photo" />)}
      </ScrollView>
      {media.length > 1 ? (
        <View style={{ position: 'absolute', top: space.s, right: space.s, backgroundColor: 'rgba(25,56,44,0.75)', borderRadius: radius.full, paddingHorizontal: space.s, paddingVertical: 2 }}>
          <Txt v="caption" c="#fff">{i + 1}/{media.length}</Txt>
        </View>
      ) : null}
    </View>
  );
}

const err = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

/** Report / block (others) or edit / delete (own) from the ⋯ button. */
export function postMenu(p: Post, onChanged: (p: Post | null) => void) {
  if (p.is_mine) {
    Alert.alert('Your post', undefined, [
      { text: 'Edit caption', onPress: () => router.push({ pathname: '/post/[id]', params: { id: p.id, edit: '1' } }) },
      { text: 'Delete post', style: 'destructive', onPress: () => Alert.alert('Delete this post?', 'Its photos and videos are removed too. This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deletePost(p.id).then(() => onChanged(null), (e) => Alert.alert(err(e))) },
      ]) },
      { text: 'Cancel', style: 'cancel' },
    ]);
    return;
  }
  Alert.alert(p.author.name, undefined, [
    { text: 'Report post', onPress: () => Alert.alert('Report this post?', 'Our team reviews reports. The author is not told who reported it.', [
      { text: 'Spam', onPress: () => void report('POST', p.id, 'SPAM').then(() => Alert.alert('Thanks, report sent.')) },
      { text: 'Inappropriate', onPress: () => void report('POST', p.id, 'INAPPROPRIATE').then(() => Alert.alert('Thanks, report sent.')) },
      { text: 'Dangerous', onPress: () => void report('POST', p.id, 'DANGEROUS').then(() => Alert.alert('Thanks, report sent.')) },
    ]) },
    { text: `Block ${p.author.name}`, style: 'destructive', onPress: () => Alert.alert(`Block ${p.author.name}?`, 'You will not see each other’s posts or profiles. You can unblock in Settings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => void setBlock(p.author.id, true).then(() => onChanged(null), (e) => Alert.alert(err(e))) },
    ]) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export function PostCard({ p, onChanged }: { p: Post; onChanged: (p: Post | null) => void }) {
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const openAuthor = () => router.push({ pathname: '/user/[id]', params: { id: p.author.id } });

  async function toggleLike() {
    if (busy) return;
    setBusy(true);
    const optimistic = { ...p, liked_by_me: !p.liked_by_me, like_count: p.like_count + (p.liked_by_me ? -1 : 1) };
    onChanged(optimistic);
    try { onChanged(await setLike(p.id, optimistic.liked_by_me)); } catch (e) { onChanged(p); Alert.alert(err(e)); } finally { setBusy(false); }
  }

  return (
    <View style={{ backgroundColor: color.bg, borderBottomWidth: 1, borderColor: color.border, paddingBottom: space.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, padding: space.m }}>
        <Pressable onPress={openAuthor} accessibilityRole="button" accessibilityLabel={`Open ${p.author.name}'s profile`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, flex: 1 }}>
          <Avatar u={p.author} />
          <View style={{ flex: 1 }}>
            <Txt v="headline" numberOfLines={1}>{p.author.username ? `@${p.author.username}` : p.author.name}</Txt>
            {p.location_name ? <Txt v="caption" c={color.text2} numberOfLines={1}>{p.location_name}</Txt> : null}
          </View>
        </Pressable>
        <Pressable onPress={() => postMenu(p, onChanged)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Post options">
          <Icon name="more_vert" tint={color.text2} />
        </Pressable>
      </View>
      <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })} accessibilityLabel="Open post">
        <MediaCarousel media={p.media} width={width} />
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.l, paddingHorizontal: space.m, paddingTop: space.s }}>
        <Pressable onPress={toggleLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={p.liked_by_me ? 'Unlike' : 'Like'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Icon name={p.liked_by_me ? 'favorite' : 'favorite_border'} tint={p.liked_by_me ? color.sos : color.text} />
          <Txt v="footnote">{p.like_count}</Txt>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })} hitSlop={8} accessibilityRole="button"
          accessibilityLabel="Comments" style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Icon name="chat_bubble_outline" tint={color.text} />
          <Txt v="footnote">{p.comment_count}</Txt>
        </Pressable>
        <Pressable onPress={() => void Share.share({ message: `${p.author.name} on TrackMate: ${p.caption}${p.location_name ? ` (${p.location_name})` : ''}` })}
          hitSlop={8} accessibilityRole="button" accessibilityLabel="Share">
          <Icon name="share" tint={color.text} />
        </Pressable>
        {p.latitude !== null ? <Icon name="location_on" size={18} tint={color.accentText} /> : null}
      </View>
      {p.caption ? (
        <Txt v="callout" style={{ paddingHorizontal: space.m, paddingTop: space.xs }}>
          <Txt v="callout" style={{ fontWeight: '700' }}>{p.author.username ?? p.author.name} </Txt>{p.caption}
        </Txt>
      ) : null}
      <Txt v="caption" c={color.text2} style={{ paddingHorizontal: space.m, paddingTop: space.xs }}>{timeAgo(p.created_at)}</Txt>
    </View>
  );
}
