import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { useStore } from '@/lib/store';
import { logout, sessionStore } from '@/trackmate/auth';
import { MODE_LABEL, prefsStore, setMode, type Mode } from '@/trackmate/prefs';
import { Button, Card, Chip, Row, Screen, Section, Txt, s } from '@/ui/kit';
import { color } from '@/ui/theme';

export default function Settings() {
  const { session } = useStore(sessionStore);
  const { mode } = useStore(prefsStore);
  const version = `${Constants.expoConfig?.version ?? '?'} (build ${Constants.expoConfig?.android?.versionCode ?? '?'})`;

  function signOut() {
    Alert.alert('Sign out?', 'Your account and posts stay as they are. SOS, relaying and your journeys keep working on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      // logout(): revokes the session on the server, then deletes the token from secure storage.
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <Screen>
      <Section title="Account">
        <Card>
          <Row icon="edit" title="Edit profile" subtitle="Name, photo, bio, interests, location" onPress={() => router.push('/profile/edit')} />
          {session ? <Row icon="mail" title="Email, phone and password" subtitle={`${session.user.email} · ${session.user.phone}`} onPress={() => router.push('/profile/edit')} /> : null}
          <Row icon="workspace_premium" title="Plan & pricing" subtitle="Free plan · per-trip Premium options" onPress={() => router.push('/plans')} />
        </Card>
      </Section>

      <Section title="Safety">
        <Card>
          <Row icon="health_and_safety" title="Safety options" subtitle="Alerts, check-ins, GPS, permissions" onPress={() => router.push('/settings/safety')} />
          <Row icon="contacts" title="Trusted contacts" onPress={() => router.push('/contacts')} />
          <Row icon="cell_tower" title="Help others" subtitle="Nearby mesh, siren volume, received alerts" onPress={() => router.push('/relay')} />
          <Row icon="history" title="SOS history" onPress={() => router.push('/sos-history')} />
          <Row icon="route" title="Journeys" onPress={() => router.push('/journeys')} />
          <Row icon="settings_ethernet" title="Connection settings" subtitle="Device ID, gateway addresses" onPress={() => router.push('/connection')} />
        </Card>
      </Section>

      <Section title="Notifications">
        <Card>
          <Row icon="notifications" title="Notification preferences" subtitle="SOS alerts, sound and vibration" onPress={() => router.push('/settings/safety')} />
        </Card>
      </Section>

      <Section title="Privacy">
        <Card>
          <Row icon="visibility" title="Profile visibility" subtitle="Show or hide your home location, username, bio" onPress={() => router.push('/profile/edit')} />
          <Row icon="call" title="Calls during an SOS" subtitle="Whether nearby users can call you" onPress={() => router.push('/connection')} />
          <Row icon="block" title="Blocked users" onPress={() => router.push('/settings/blocked')} />
        </Card>
      </Section>

      <Section title="App mode">
        <View style={s.wrap} accessibilityRole="radiogroup">
          {(['TOURIST', 'TREKKER'] as Mode[]).map((m) => <Chip key={m} label={MODE_LABEL[m]} selected={mode === m} onPress={() => setMode(m)} />)}
        </View>
      </Section>

      <Section title="About">
        <Card>
          <Row icon="description" title="Terms and Conditions" onPress={() => router.push('/legal/terms')} />
          <Row icon="privacy_tip" title="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
          <Row icon="help" title="Help and support" subtitle="Ask your trek organizer or the TrackMate team. In danger: call your local emergency number." />
          <Row icon="info" title="App version" subtitle={version} />
        </Card>
        <Txt v="footnote" c={color.text2}>TrackMate is not an emergency service and cannot guarantee a response.</Txt>
      </Section>

      {session ? <Button kind="destructive" icon="logout" label="Sign out" onPress={signOut} /> : null}
    </Screen>
  );
}
