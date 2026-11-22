import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/trackmate/auth';
import { getMessages, markRead, sendMessage, type Message } from '@/trackmate/social';
import { Banner, Button, Txt, s } from '@/ui/kit';
import { color, radius, space } from '@/ui/theme';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** One conversation. Refreshes every 4 s while open (no push service is set up). */
export default function Chat() {
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      const p = await getMessages(id);
      setMsgs(p.items);
      setError(null);
      if (p.items.some((m) => !m.mine && !m.read_at)) void markRead(id).catch(() => {});
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load messages.'); }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); const t = setInterval(() => void load(), 4000); return () => clearInterval(t); }, [load]));

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const m = await sendMessage(id, body);
      setMsgs((x) => [...x, m]);
      setText('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Not sent. Try again.'); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title: name || 'Messages' }} />
      {error ? <View style={{ padding: space.m }}><Banner tone="critical" icon="error" title={error} /></View> : null}
      <FlatList ref={listRef} data={msgs} keyExtractor={(m) => m.id}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={{ padding: space.l, gap: space.s }}
        ListEmptyComponent={<Txt v="callout" c={color.text2} center>Say hello. Messages are only between the two of you.</Txt>}
        renderItem={({ item: m }) => (
          <View style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '80%', backgroundColor: m.mine ? color.primary : color.surface,
            borderRadius: radius.l, borderBottomRightRadius: m.mine ? 4 : radius.l, borderBottomLeftRadius: m.mine ? radius.l : 4, paddingHorizontal: space.m, paddingVertical: space.s }}>
            <Txt v="callout" c={m.mine ? color.onPrimary : color.text}>{m.body}</Txt>
            <Txt v="caption" c={m.mine ? '#D8E8DE' : color.text2} style={{ alignSelf: 'flex-end' }}>
              {time(m.created_at)}{m.mine && m.read_at ? ' · Seen' : ''}
            </Txt>
          </View>
        )} />
      <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'flex-end', padding: space.m, paddingBottom: insets.bottom + space.m, borderTopWidth: 1, borderColor: color.border }}>
        <TextInput accessibilityLabel="Message" value={text} onChangeText={setText} multiline maxLength={2000}
          placeholder="Message…" placeholderTextColor={color.text3} style={[s.input, { flex: 1, maxHeight: 120 }]} />
        <Button compact label="Send" icon="send" loading={busy} disabled={!text.trim()} onPress={send} />
      </View>
    </KeyboardAvoidingView>
  );
}
