import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { useStore } from '@/lib/store';
import { ApiError, addEmergencyContact, editEmergencyContact, sessionStore } from '@/trackmate/auth';
import { RELATIONSHIP_LABEL, validateContact, type Relationship } from '@/trackmate/smsText';
import { Banner, Button, Chip, FormField, Screen, Txt, s } from '@/ui/kit';
import { space } from '@/ui/theme';

const RELATIONSHIPS = Object.keys(RELATIONSHIP_LABEL) as Relationship[];

/** Add (no id) or edit (id) one of the account's emergency contacts on the server. */
export default function EmergencyContactForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useStore(sessionStore);
  const existing = session?.user.emergency_contacts.find((c) => c.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [relationship, setRelationship] = useState<Relationship>(existing?.relationship ?? 'FAMILY');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const problem = validateContact({ name, phone });
    if (problem) return setError(problem);
    setBusy(true); setError(null);
    try {
      const body = { name: name.trim(), phone: phone.trim(), relationship };
      await (existing ? editEmergencyContact(existing.id, body) : addEmergencyContact(body));
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <FormField label="Name" value={name} onChange={(t) => { setName(t); setError(null); }} autoComplete="name" autoCapitalize="words" />
        <FormField label="Mobile number" value={phone} onChange={(t) => { setPhone(t); setError(null); }} keyboard="phone-pad" autoComplete="tel"
          placeholder="+91 98765 43210" hint="Include the country code." />
        <View style={{ gap: space.s }}>
          <Txt v="headline">Relationship</Txt>
          <View style={s.wrap} accessibilityRole="radiogroup">
            {RELATIONSHIPS.map((r) => <Chip key={r} label={RELATIONSHIP_LABEL[r]} selected={r === relationship} onPress={() => setRelationship(r)} />)}
          </View>
        </View>
        {error ? <Banner tone="critical" icon="error" title={error} /> : null}
        <Button label={existing ? 'Save changes' : 'Add contact'} icon="check_circle" loading={busy} onPress={save} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
