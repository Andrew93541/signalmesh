import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { login } from '@/trackmate/auth';
import { useStore } from '@/lib/store';
import { prefsStore, savePrefs } from '@/trackmate/prefs';
import { Banner, Button, FormField, Screen, SettingField, Txt } from '@/ui/kit';
import { Logo } from '@/ui/Logo';
import { color, space } from '@/ui/theme';

export default function Login() {
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { backendUrl } = useStore(prefsStore);
  const [showServer, setShowServer] = useState(!backendUrl);

  async function submit() {
    if (!identifier.trim() || !password) {
      setError('Enter your email or phone number and your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: insets.top, backgroundColor: color.bg }} />
      <Screen>
        <View style={{ alignItems: 'center', gap: space.s }}>
          <Logo size={140} />
          <Txt v="title1" center>Welcome back</Txt>
          <Txt v="callout" c={color.text2} center>Sign in to TrackMate</Txt>
        </View>

        <FormField label="Email or phone number" value={identifier} onChange={setIdentifier}
          keyboard="email-address" autoComplete="username" placeholder="you@example.com or +91…" />
        <FormField label="Password" value={password} onChange={setPassword} secure autoComplete="password" />

        {error ? <Banner tone="critical" icon="error" title={error} /> : null}

        <Button label="Sign in" onPress={submit} loading={busy} />
        <Button label="Forgot password?" kind="tertiary" onPress={() => router.push('/auth/forgot')} />

        <View style={{ height: 1, backgroundColor: color.border }} />

        <Button label="Create an account" kind="secondary" icon="person" onPress={() => router.push('/auth/register')} />
        <Button label="Continue without an account" kind="tertiary" onPress={() => savePrefs({ guest: true })} />
        <Txt v="footnote" c={color.text2} center>
          Without an account you can still send an SOS, check in and track journeys on this phone.
        </Txt>

        {showServer ? (
          <SettingField label="Account server address" value={backendUrl} placeholder="https://api.example.org"
            hint={backendUrl ? 'Your organizer gives you this address.' : 'Not set up in this build. Your organizer gives you this address.'}
            onSave={(v) => savePrefs({ backendUrl: v })} />
        ) : (
          <Button label="Account server settings" kind="tertiary" compact onPress={() => setShowServer(true)} />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
