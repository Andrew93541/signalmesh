import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';

import { useStore } from '@/lib/store';
import { ApiError, changePassword, sessionStore } from '@/trackmate/auth';
import { passwordError } from '@/trackmate/validation';
import { Banner, Button, FormField, Screen, Txt } from '@/ui/kit';
import { color } from '@/ui/theme';

export default function ChangePassword() {
  const { session } = useStore(sessionStore);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextProblem = next ? (passwordError(next, session?.user.email) ?? undefined) : undefined;
  const mismatch = confirm && confirm !== next ? 'Passwords do not match' : undefined;

  async function save() {
    setBusy(true); setError(null);
    try {
      await changePassword(current, next);
      Alert.alert('Password changed', 'Other phones signed in to your account have been signed out.');
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Txt c={color.text2}>This signs out every other phone using your account. This phone stays signed in.</Txt>
        <FormField label="Current password" value={current} onChange={setCurrent} secure autoComplete="password" />
        <FormField label="New password" value={next} onChange={setNext} secure autoComplete="new-password" error={nextProblem}
          hint="At least 10 characters, with letters and numbers." />
        <FormField label="Confirm new password" value={confirm} onChange={setConfirm} secure autoComplete="new-password" error={mismatch} />
        {error ? <Banner tone="critical" icon="error" title={error} /> : null}
        <Button label="Change password" icon="lock" loading={busy} disabled={!current || !next || !!nextProblem || confirm !== next} onPress={save} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
