import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { getFix } from '@/lib/location';
import { ApiError } from '@/trackmate/auth';
import { cancelUpload, createPost } from '@/trackmate/social';
import { Banner, Button, Card, FormField, Icon, Screen, SwitchRow, Txt, s } from '@/ui/kit';
import { color, radius, space } from '@/ui/theme';

type Picked = { uri: string; mime: string; video: boolean };
const MAX = 10;

export default function NewPost() {
  const [media, setMedia] = useState<Picked[]>([]);
  const [caption, setCaption] = useState('');
  const [place, setPlace] = useState('');
  const [shareExact, setShareExact] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    // Android's system photo picker: no storage permission needed.
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true,
      selectionLimit: MAX - media.length, quality: 0.8, videoMaxDuration: 60 });
    if (r.canceled) return;
    const add = r.assets.map((a) => ({ uri: a.uri, video: a.type === 'video', mime: a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg') }));
    setMedia((m) => [...m, ...add].slice(0, MAX));
    setError(null);
  }

  async function submit() {
    if (!media.length) return setError('Add at least one photo or video.');
    setError(null);
    try {
      let lat: number | null = null, lon: number | null = null;
      if (shareExact) {
        setBusy('Getting your location…');
        const { latitude, longitude } = await getFix();
        if (latitude === null || longitude === null) throw new ApiError('No GPS fix right now. Turn off "Share exact location" or try again outside.', 0);
        lat = latitude; lon = longitude;
      }
      await createPost({ caption: caption.trim(), location_name: place.trim() || null, share_location: shareExact, latitude: lat, longitude: lon,
        media: media.map(({ uri, mime }) => ({ uri, mime })) },
        (done, total, f) => setBusy(done < total ? `Uploading ${done + 1} of ${total} · ${Math.round(f * 100)}%` : 'Publishing…'));
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not publish. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
          {media.map((m, i) => (
            <View key={m.uri} style={{ width: 110, height: 110, borderRadius: radius.m, overflow: 'hidden', backgroundColor: color.surface }}>
              <Image source={{ uri: m.uri }} style={{ width: 110, height: 110 }} contentFit="cover" />
              {m.video ? <View style={{ position: 'absolute', left: 6, bottom: 6 }}><Icon name="videocam" size={20} tint="#fff" /></View> : null}
              <Pressable onPress={() => setMedia((x) => x.filter((_, j) => j !== i))} accessibilityLabel="Remove" hitSlop={8}
                style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(25,56,44,0.8)', borderRadius: 12 }}>
                <Icon name="close" size={20} tint="#fff" />
              </Pressable>
            </View>
          ))}
          {media.length < MAX ? (
            <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel="Add photos or videos"
              style={{ width: 110, height: 110, borderRadius: radius.m, borderWidth: 2, borderStyle: 'dashed', borderColor: color.borderStrong, alignItems: 'center', justifyContent: 'center', gap: space.xs }}>
              <Icon name="add_photo_alternate" tint={color.primary} />
              <Txt v="caption" c={color.primary}>Photos / video</Txt>
            </Pressable>
          ) : null}
        </ScrollView>
        <Txt v="footnote" c={color.text2}>Up to {MAX} items. Photos up to 10 MB; videos up to 60 MB and 60 seconds.</Txt>

        <View style={{ gap: space.xs }}>
          <Txt v="headline">Caption</Txt>
          <TextInput accessibilityLabel="Caption" value={caption} onChangeText={setCaption} multiline maxLength={2200}
            placeholder="How was the trail?" placeholderTextColor={color.text3}
            style={[s.input, { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }]} />
        </View>
        <FormField label="Trip location (name)" value={place} onChange={setPlace} autoCapitalize="words" placeholder="e.g. Rajmachi Fort"
          hint="Shown as text. It does not reveal where you are now." />
        <Card>
          <SwitchRow title="Share exact location" subtitle="Adds your current GPS coordinates to this post. Off by default; anyone who sees the post can see them."
            value={shareExact} onChange={setShareExact} />
        </Card>

        {error ? <Banner tone="critical" icon="error" title={error} /> : null}
        <Button label={busy ?? 'Publish'} icon="send" loading={!!busy} disabled={!media.length} onPress={submit} />
        {busy?.startsWith('Uploading') ? <Button kind="tertiary" label="Cancel upload" onPress={cancelUpload} /> : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
