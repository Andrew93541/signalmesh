import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { settingsStore } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { EXPERIENCE_LABEL, logout, photoSource, sessionStore } from '@/trackmate/auth';
import { MODE_LABEL, prefsStore, savePrefs, setMode, type Mode } from '@/trackmate/prefs';
import { Card, Chip, Icon, Row, Screen, Section, Txt, s } from '@/ui/kit';
import { color, space } from '@/ui/theme';

export default function Profile() {
  const { mode } = useStore(prefsStore);
  const settings = useStore(settingsStore);
  const { session } = useStore(sessionStore);
  const photo = photoSource(session?.user);

  return (
    <Screen tab>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.l }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          {photo ? <Image source={photo} style={{ width: 64, height: 64 }} contentFit="cover" accessibilityLabel="Your profile photo" />
            : <Txt v="title1" c={color.primary}>{(session?.user.full_name ?? settings.workerName).slice(0, 1).toUpperCase()}</Txt>}
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="title1">{session?.user.full_name ?? settings.workerName}</Txt>
          <Txt v="footnote" c={color.text2}>Device {settings.deviceId} · {session ? "Signed in" : "No account"}</Txt>
        </View>
      </View>

      <Section title="Account">
        <Card>
          {session ? (
            <>
              <Row icon="edit" title="Edit profile"
                subtitle={[session.user.trekking_experience ? EXPERIENCE_LABEL[session.user.trekking_experience] : null,
                  `${session.user.emergency_contacts.length} emergency contact${session.user.emergency_contacts.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                onPress={() => router.push('/profile/edit')} />
              <Row icon="mail" title={session.user.email} subtitle={session.user.email_verified ? 'Email verified' : 'Email not verified'} />
              <Row icon="call" title={session.user.phone} subtitle={session.user.phone_verified ? 'Phone verified' : 'Phone not verified'} />
              <Row icon="logout" title="Sign out" danger
                onPress={() => Alert.alert('Sign out?', 'Journeys, contacts and SOS history stay on this phone. SOS keeps working.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
                ])} />
            </>
          ) : (
            <Row icon="person" title="Sign in or create an account"
              subtitle="You're using TrackMate without an account."
              onPress={() => savePrefs({ guest: false })} />
          )}
        </Card>
      </Section>

      <Section title="Mode">
        <View style={s.wrap} accessibilityRole="radiogroup">
          {(['TOURIST', 'TREKKER'] as Mode[]).map((m) => (
            <Chip key={m} label={MODE_LABEL[m]} icon={m === 'TREKKER' ? 'hiking' : 'luggage'} selected={mode === m} onPress={() => setMode(m)} />
          ))}
        </View>
        <Txt v="footnote" c={color.text2}>Changes what Home shows first. Your journeys and safety settings stay the same.</Txt>
      </Section>

      <Section title="Safety">
        <Card>
          <Row icon="contacts" title="Trusted contacts" subtitle="People to text after an SOS" onPress={() => router.push('/contacts')} />
          <Row icon="history" title="SOS history" subtitle="Every SOS sent from this phone" onPress={() => router.push('/sos-history')} />
          <Row icon="cell_tower" title="Help others" subtitle="Pass nearby people's SOS messages on" onPress={() => router.push('/relay')} />
          <Row icon="settings" title="Connection settings" subtitle="Name, device ID, safety station address" onPress={() => router.push('/connection')} />
        </Card>
      </Section>

      <Section title="About">
        <Card tone="surface">
          <View style={{ flexDirection: 'row', gap: space.m }}>
            <Icon name="info" tint={color.text2} />
            <Txt v="footnote" c={color.text2} style={{ flex: 1 }}>
              TrackMate is not an emergency service. It helps you ask for help and share where you are, but it cannot guarantee a response.
              Fitness, co-travellers and plans are coming in later updates.
            </Txt>
          </View>
        </Card>
      </Section>
    </Screen>
  );
}
