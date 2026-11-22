import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { ApiError } from '@/trackmate/auth';
import { addComment, deleteComment, editPost, getComments, getPost, timeAgo, type Comment, type Post } from '@/trackmate/social';
import { Banner, Button, Icon, Screen, Txt, s } from '@/ui/kit';
import { Avatar, PostCard } from '@/ui/PostCard';
import { color, space } from '@/ui/theme';

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

export default function PostDetail() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([getPost(id), getComments(id)]).then(([p, c]) => {
      if (!live) return;
      setPost(p); setComments(c);
      if (edit && p.is_mine) setEditing(p.caption);
    }, (e) => live && setError(msg(e)));
    return () => { live = false; };
  }, [id, edit]);

  if (error) return <Screen><Banner tone="critical" icon="error" title={error} /></Screen>;
  if (!post) return <Screen><Txt c={color.text2}>Loading…</Txt></Screen>;

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const c = await addComment(id, text.trim());
      setComments((x) => [...x, c]);
      setPost((p) => (p ? { ...p, comment_count: p.comment_count + 1 } : p));
      setText('');
    } catch (e) { Alert.alert(msg(e)); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Post' }} />
      <Screen>
        <View style={{ marginHorizontal: -space.l }}>
          <PostCard p={post} onChanged={(p) => (p ? setPost(p) : router.back())} />
        </View>
        {editing !== null ? (
          <View style={{ gap: space.s }}>
            <TextInput accessibilityLabel="Edit caption" value={editing} onChangeText={setEditing} multiline maxLength={2200}
              style={[s.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]} />
            <Button label="Save caption" onPress={() => void editPost(id, { caption: editing }).then((p) => { setPost(p); setEditing(null); }, (e) => Alert.alert(msg(e)))} />
            <Button kind="tertiary" label="Cancel" onPress={() => setEditing(null)} />
          </View>
        ) : null}
        <Txt v="title2">Comments</Txt>
        {comments.length === 0 ? <Txt v="callout" c={color.text2}>No comments yet.</Txt> : null}
        {comments.map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', gap: space.s }}>
            <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: c.author.id } })} accessibilityLabel={`Open ${c.author.name}`}>
              <Avatar u={c.author} size={32} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Txt v="callout"><Txt v="callout" style={{ fontWeight: '700' }}>{c.author.username ?? c.author.name} </Txt>{c.body}</Txt>
              <Txt v="caption" c={color.text2}>{timeAgo(c.created_at)}</Txt>
            </View>
            {c.can_delete ? (
              <Pressable hitSlop={10} accessibilityLabel="Delete comment" onPress={() => Alert.alert('Delete comment?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => void deleteComment(c.id).then(() => {
                  setComments((x) => x.filter((y) => y.id !== c.id));
                  setPost((p) => (p ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p));
                }, (e) => Alert.alert(msg(e))) },
              ])}>
                <Icon name="delete_outline" size={20} tint={color.text2} />
              </Pressable>
            ) : null}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'flex-end' }}>
          <TextInput accessibilityLabel="Add a comment" value={text} onChangeText={setText} maxLength={1000} multiline
            placeholder="Add a comment…" placeholderTextColor={color.text3} style={[s.input, { flex: 1 }]} />
          <Button compact label="Send" loading={busy} disabled={!text.trim()} onPress={send} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
