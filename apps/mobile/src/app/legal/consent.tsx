import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { addContact } from '@/trackmate/contacts';
import { LEGAL, getRegistrationDraft, register, setRegistrationDraft } from '@/trackmate/auth';
import { Banner, Button, Checkbox, Icon, Screen, Txt } from '@/ui/kit';
import { color, space } from '@/ui/theme';

export default function Consent() {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = getRegistrationDraft();

  async function create() {
    if (!draft) return router.replace('/auth/register');
    setBusy(true);
    setError(null);
    try {
      await register(draft);
      // Also keep the emergency contact on the phone so it works offline (texting after an SOS).
      addContact(draft.emergency_contact);
      setRegistrationDraft(null);
      // Navigation happens automatically: the signed-in screens become available.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: space.xs }}>
        <Txt v="title1">Terms and consent</Txt>
        <Txt v="body" c={color.text2}>Please read and accept both documents to create your account.</Txt>
      </View>

      <View style={{ gap: space.m }}>
        <Button label="Read the Terms and Conditions" kind="secondary" icon="info" onPress={() => router.push('/legal/terms')} />
        <Button label="Read the Privacy Policy" kind="secondary" icon="shield" onPress={() => router.push('/legal/privacy')} />
      </View>

      <View style={{ gap: space.s }}>
        <Checkbox checked={terms} onChange={setTerms} label="I accept the Terms and Conditions">
          <Txt v="body">I have read and accept the <Txt v="body" style={{ fontWeight: '700' }}>Terms and Conditions</Txt></Txt>
          <Txt v="footnote" c={color.text2}>Version {LEGAL.TERMS_OF_SERVICE}</Txt>
        </Checkbox>
        <Checkbox checked={privacy} onChange={setPrivacy} label="I accept the Privacy Policy">
          <Txt v="body">I have read and accept the <Txt v="body" style={{ fontWeight: '700' }}>Privacy Policy</Txt></Txt>
          <Txt v="footnote" c={color.text2}>Version {LEGAL.PRIVACY_POLICY}</Txt>
        </Checkbox>
      </View>

      <View style={{ flexDirection: 'row', gap: space.m, backgroundColor: color.surface, borderRadius: 14, padding: space.l }}>
        <Icon name="info" size={22} tint={color.primary} />
        <Txt v="footnote" c={color.text} style={{ flex: 1 }}>
          Accepting these does <Txt v="footnote" style={{ fontWeight: '700' }}>not</Txt> turn on location sharing, health data access
          or automatic alerts to your contacts. TrackMate asks for each of those separately, only when you use them.
        </Txt>
      </View>

      {!draft ? <Banner tone="warning" icon="warning" title="Your details were not found" body="Go back and fill in the registration form." /> : null}
      {error ? <Banner tone="critical" icon="error" title="Could not create your account" body={error} /> : null}

      <Button label="Create account" icon="check_circle" onPress={create} disabled={!terms || !privacy || !draft} loading={busy} />
    </Screen>
  );
}
