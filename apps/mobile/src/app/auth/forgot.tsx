import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { requestReset, resetPassword } from '@/trackmate/auth';
import { passwordError } from '@/trackmate/validation';
import { Banner, Button, FormField, Screen, Txt } from '@/ui/kit';
import { color } from '@/ui/theme';

export default function Forgot() {
  const [identifier, setIdentifier] = useState('');
  const [delivery, setDelivery] = useState<'dev-log' | 'not-configured' | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function send() {
    if (identifier.trim().length < 3) return setError('Enter the email or phone number on your account.');
    setBusy(true); setError(null);
    try {
      setDelivery((await requestReset(identifier.trim())).delivery);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not request a code.');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const pw = passwordError(password);
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code.');
    if (pw) return setError(pw);
    setBusy(true); setError(null);
    try {
      await resetPassword(identifier.trim(), code, password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <Banner tone="success" icon="check_circle" title="Password changed" body="You have been signed out on all devices. Sign in with your new password." />
        <Button label="Back to sign in" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Txt v="body" c={color.text2}>We&apos;ll send a 6-digit code to reset your password.</Txt>
        <FormField label="Email or phone number" value={identifier} onChange={setIdentifier} keyboard="email-address" autoComplete="username" />
        {!delivery ? <Button label="Send code" onPress={send} loading={busy} /> : null}

        {delivery === 'not-configured' ? (
          <Banner tone="warning" icon="warning" title="Codes can't be sent yet"
            body="Email and SMS sending isn't set up in this test version of TrackMate, so no code was sent. Contact the TrackMate team to reset your password." />
        ) : null}
        {delivery === 'dev-log' ? (
          <Banner tone="info" icon="info" title="Test version"
            body="If an account exists, a code was created. In this test version it is written to the server log instead of being emailed." />
        ) : null}

        {delivery ? (
          <>
            <FormField label="6-digit code" value={code} onChange={setCode} keyboard="number-pad" autoComplete="one-time-code" />
            <FormField label="New password" value={password} onChange={setPassword} secure autoComplete="new-password"
              hint="At least 10 characters, with letters and numbers." />
            <Button label="Set new password" onPress={reset} loading={busy} />
          </>
        ) : null}

        {error ? <Banner tone="critical" icon="error" title={error} /> : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
