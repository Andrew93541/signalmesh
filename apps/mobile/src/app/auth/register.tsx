import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { setRegistrationDraft } from '@/trackmate/auth';
import { normalizePhone, RELATIONSHIP_LABEL, type Relationship } from '@/trackmate/smsText';
import { registrationErrors, type RegistrationForm } from '@/trackmate/validation';
import { Banner, Button, Chip, FormField, Screen, Section, Txt, s } from '@/ui/kit';
import { Logo } from '@/ui/Logo';
import { color, space } from '@/ui/theme';

const RELATIONSHIPS = Object.keys(RELATIONSHIP_LABEL) as Relationship[];

export default function Register() {
  const [f, setF] = useState<RegistrationForm>({
    fullName: '', phone: '', email: '', password: '', confirm: '', contactName: '', contactPhone: '',
  });
  const [relationship, setRelationship] = useState<Relationship>('FAMILY');
  const [showErrors, setShowErrors] = useState(false);
  const errors = showErrors ? registrationErrors(f) : {};
  const set = (k: keyof RegistrationForm) => (v: string) => setF({ ...f, [k]: v });

  function next() {
    const problems = registrationErrors(f);
    setShowErrors(true);
    if (Object.keys(problems).length > 0) return;
    setRegistrationDraft({
      full_name: f.fullName.trim(),
      email: f.email.trim().toLowerCase(),
      phone: normalizePhone(f.phone)!,
      password: f.password,
      emergency_contact: { name: f.contactName.trim(), phone: normalizePhone(f.contactPhone)!, relationship },
    });
    router.push('/legal/consent');
  }

  const count = Object.keys(errors).length;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <Logo size={64} />
          <View style={{ flex: 1 }}>
            <Txt v="title1">Create your account</Txt>
            <Txt v="footnote" c={color.text2}>Step 1 of 2 · Your details</Txt>
          </View>
        </View>

        <Section title="About you">
          <FormField label="Full name" value={f.fullName} onChange={set('fullName')} error={errors.fullName} autoComplete="name" autoCapitalize="words" />
          <FormField label="Phone number" value={f.phone} onChange={set('phone')} error={errors.phone} keyboard="phone-pad" autoComplete="tel" placeholder="+91 98765 43210" hint="Include the country code." />
          <FormField label="Email address" value={f.email} onChange={set('email')} error={errors.email} keyboard="email-address" autoComplete="email" />
          <FormField label="Password" value={f.password} onChange={set('password')} error={errors.password} secure autoComplete="new-password"
            hint="At least 10 characters, with letters and numbers." />
          <FormField label="Confirm password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} secure autoComplete="new-password" />
        </Section>

        <Section title="Emergency contact">
          <Txt v="callout" c={color.text2}>Someone we can suggest you contact in an emergency. You can add more later.</Txt>
          <FormField label="Contact name" value={f.contactName} onChange={set('contactName')} error={errors.contactName} autoCapitalize="words" />
          <FormField label="Contact phone number" value={f.contactPhone} onChange={set('contactPhone')} error={errors.contactPhone} keyboard="phone-pad" placeholder="+91 91234 56789" />
          <Txt v="headline">Relationship</Txt>
          <View style={s.wrap} accessibilityRole="radiogroup">
            {RELATIONSHIPS.map((r) => (
              <Chip key={r} label={RELATIONSHIP_LABEL[r]} selected={r === relationship} onPress={() => setRelationship(r)} />
            ))}
          </View>
        </Section>

        {count > 0 ? <Banner tone="critical" icon="error" title={`Please fix ${count} field${count > 1 ? 's' : ''} above`} /> : null}
        <Button label="Continue to terms" onPress={next} />
        <Button label="I already have an account" kind="tertiary" onPress={() => router.back()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
