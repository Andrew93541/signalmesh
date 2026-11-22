import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { ApiError, confirmContactChange, startContactChange, type ChangeKind } from '@/trackmate/auth';
import { emailError, phoneError } from '@/trackmate/validation';
import { Banner, Button, FormField, Screen, Txt } from '@/ui/kit';
import { color } from '@/ui/theme';

/** Email or phone change: current password → code sent to the NEW address → confirm. */
export default function ChangeContact() {
  const { kind = 'email' } = useLocalSearchParams<{ kind?: ChangeKind }>();
  const isEmail = kind === 'email';
  const [value, setValue] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [delivery, setDelivery] = useState<'dev-log' | 'not-configured' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valueProblem = value ? ((isEmail ? emailError(value) : phoneError(value)) ?? undefined) : undefined;

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.'); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        {step === 'enter' ? (
          <>
            <Txt c={color.text2}>
              {isEmail ? 'We send a 6-digit code to the new email address.' : 'We send a 6-digit code by SMS to the new number.'} Your {kind} changes only after you enter it.
            </Txt>
            <FormField label={isEmail ? 'New email' : 'New mobile number'} value={value} onChange={setValue} error={valueProblem}
              keyboard={isEmail ? 'email-address' : 'phone-pad'} autoComplete={isEmail ? 'email' : 'tel'} />
            <FormField label="Current password" value={password} onChange={setPassword} secure autoComplete="password" />
            {error ? <Banner tone="critical" icon="error" title={error} /> : null}
            <Button label="Send code" icon="send" loading={busy} disabled={!value || !!valueProblem || !password}
              onPress={() => run(async () => {
                const r = await startContactChange(kind, value.trim(), password);
                setPassword(''); setDelivery(r.delivery); setStep('code');
              })} />
          </>
        ) : (
          <>
            {delivery === 'not-configured' ? (
              <Banner tone="warning" icon="warning" title="Codes can't be delivered yet"
                body={`No ${isEmail ? 'email' : 'SMS'} provider is set up on this server, so the code was not sent. Your ${kind} is unchanged.`} />
            ) : (
              <Banner tone="info" icon="info" title="Test server"
                body="This server has no email/SMS provider. The code is in the server log (development only)." />
            )}
            <FormField label="6-digit code" value={code} onChange={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboard="number-pad" autoComplete="one-time-code" />
            {error ? <Banner tone="critical" icon="error" title={error} /> : null}
            <Button label={`Confirm new ${kind}`} icon="check_circle" loading={busy} disabled={code.length !== 6}
              onPress={() => run(async () => { await confirmContactChange(kind, code); router.back(); })} />
            <Button kind="tertiary" label="Start again" onPress={() => { setStep('enter'); setCode(''); setError(null); }} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
