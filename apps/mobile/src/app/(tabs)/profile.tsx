import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/lib/store';
import { sessionStore } from '@/trackmate/auth';
import { savePrefs } from '@/trackmate/prefs';
import { Button, EmptyState, Icon, Txt } from '@/ui/kit';
import { ProfileView } from '@/ui/ProfileView';
import { color, space } from '@/ui/theme';

function TopBar({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + space.m, paddingHorizontal: space.l, flexDirection: 'row', alignItems: 'center' }}>
      <Txt v="title2" style={{ flex: 1 }} numberOfLines={1}>{title}</Txt>
      <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={12}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="settings" size={26} tint={color.text} />
      </Pressable>
    </View>
  );
}

export default function ProfileTab() {
  const { session } = useStore(sessionStore);
  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <TopBar title="Profile" />
        <View style={{ padding: space.l }}>
          <EmptyState icon="person" title="You're using TrackMate without an account" body="SOS, relaying and journeys work without one. Sign in to post, follow trekkers and keep your profile."
            action={<Button label="Sign in or create an account" onPress={() => savePrefs({ guest: false })} />} />
        </View>
      </View>
    );
  }
  const u = session.user;
  return <ProfileView userId={u.id} header={<TopBar title={u.username ? `@${u.username}` : u.full_name} />} />;
}
