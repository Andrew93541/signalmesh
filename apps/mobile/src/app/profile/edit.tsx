import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { useStore } from '@/lib/store';
import {
  ApiError, EXPERIENCE_LABEL, deleteEmergencyContact, deletePhoto, photoSource, sessionStore, updateProfile, uploadPhoto,
  type Experience,
} from '@/trackmate/auth';
import { RELATIONSHIP_LABEL } from '@/trackmate/smsText';
import { nameError } from '@/trackmate/validation';
import { Banner, Button, Card, Chip, FormField, Icon, Row, Screen, Section, Txt, s } from '@/ui/kit';
import { color, space } from '@/ui/theme';

const EXPERIENCES = Object.keys(EXPERIENCE_LABEL) as Experience[];
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

export default function EditProfile() {
  const { session } = useStore(sessionStore);
  const user = session?.user;
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [travel, setTravel] = useState(user?.travel_preferences ?? '');
  const [experience, setExperience] = useState<Experience | null>(user?.trekking_experience ?? null);
  const [intro, setIntro] = useState(user?.intro ?? '');
  const [busy, setBusy] = useState<'save' | 'photo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return <Screen><Txt>Sign in to edit your profile.</Txt></Screen>;
  const photo = photoSource(user);
  const nameProblem = nameError(fullName) ?? undefined;

  async function save() {
    if (nameProblem) return;
    setBusy('save'); setError(null); setSaved(false);
    try {
      await updateProfile({ full_name: fullName.trim(), travel_preferences: travel.trim() || null, trekking_experience: experience, intro: intro.trim() || null });
      setSaved(true);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  }

  async function pickPhoto() {
    // Android's system photo picker: no storage permission needed.
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    const a = r.canceled ? null : r.assets[0];
    if (!a?.base64) return;
    setBusy('photo'); setError(null);
    try {
      await uploadPhoto(a.base64, a.mimeType ?? 'image/jpeg');
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  }

  function removeContact(id: string, name: string) {
    Alert.alert(`Remove ${name}?`, 'They will no longer be listed as your emergency contact.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void deleteEmergencyContact(id).catch((e) => setError(msg(e))) },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', gap: space.s }}>
          <Pressable onPress={pickPhoto} accessibilityRole="button" accessibilityLabel="Change profile photo"
            style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            {photo ? <Image source={photo} style={{ width: 96, height: 96 }} contentFit="cover" accessibilityIgnoresInvertColors />
              : <Txt v="title1" c={color.primary}>{user.full_name.slice(0, 1).toUpperCase()}</Txt>}
          </Pressable>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button compact kind="secondary" icon="photo_camera" label={user.has_photo ? 'Change photo' : 'Add photo'} loading={busy === 'photo'} onPress={pickPhoto} />
            {user.has_photo ? <Button compact kind="tertiary" label="Remove" onPress={() => void deletePhoto().catch((e) => setError(msg(e)))} /> : null}
          </View>
        </View>

        <FormField label="Full name" value={fullName} onChange={(t) => { setFullName(t); setSaved(false); }} error={fullName ? nameProblem : undefined}
          autoComplete="name" autoCapitalize="words" />

        <View style={{ gap: space.s }}>
          <Txt v="headline">Trekking experience</Txt>
          <View style={s.wrap} accessibilityRole="radiogroup">
            {EXPERIENCES.map((x) => <Chip key={x} label={EXPERIENCE_LABEL[x]} selected={experience === x} onPress={() => { setExperience(x); setSaved(false); }} />)}
          </View>
        </View>

        <View style={{ gap: space.xs }}>
          <Txt v="headline">Travel preferences</Txt>
          <TextInput accessibilityLabel="Travel preferences" style={[s.input, { minHeight: 72, textAlignVertical: 'top', paddingTop: 12 }]} multiline maxLength={300}
            value={travel} onChangeText={(t) => { setTravel(t); setSaved(false); }} placeholder="e.g. Himalayan treks, solo, avoids monsoon" placeholderTextColor={color.text3} />
        </View>

        <View style={{ gap: space.xs }}>
          <Txt v="headline">Short intro</Txt>
          <TextInput accessibilityLabel="Short intro" style={[s.input, { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }]} multiline maxLength={500}
            value={intro} onChangeText={(t) => { setIntro(t); setSaved(false); }} placeholder="A line or two about you" placeholderTextColor={color.text3} />
          <Txt v="footnote" c={color.text2}>{intro.length}/500</Txt>
        </View>

        {error ? <Banner tone="critical" icon="error" title={error} /> : null}
        {saved ? <Banner tone="success" icon="check_circle" title="Profile saved" /> : null}
        <Button label="Save profile" icon="check_circle" loading={busy === 'save'} disabled={!!nameProblem} onPress={save} />

        <Section title="Emergency contacts">
          <Card>
            {user.emergency_contacts.map((c) => (
              <Row key={c.id} icon="contact_phone" title={c.name} subtitle={`${RELATIONSHIP_LABEL[c.relationship]} · ${c.phone}`}
                onPress={() => router.push({ pathname: '/profile/contact', params: { id: c.id } })}
                right={user.emergency_contacts.length > 1 ? (
                  <Pressable onPress={() => removeContact(c.id, c.name)} accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`} hitSlop={12}>
                    <Icon name="delete" tint={color.text2} />
                  </Pressable>
                ) : undefined} />
            ))}
            {user.emergency_contacts.length < 5 ? (
              <Row icon="person_add" title="Add emergency contact" onPress={() => router.push('/profile/contact')} />
            ) : null}
          </Card>
          <Txt v="footnote" c={color.text2}>Up to 5. Responders see these when you send an SOS while signed in.</Txt>
        </Section>

        <Section title="Sign-in details">
          <Card>
            <Row icon="mail" title={user.email} subtitle={user.email_verified ? 'Verified' : 'Not verified'}
              onPress={() => router.push({ pathname: '/profile/change', params: { kind: 'email' } })} />
            <Row icon="call" title={user.phone} subtitle={user.phone_verified ? 'Verified' : 'Not verified'}
              onPress={() => router.push({ pathname: '/profile/change', params: { kind: 'phone' } })} />
            <Row icon="lock" title="Change password" onPress={() => router.push('/profile/password')} />
          </Card>
        </Section>
      </Screen>
    </KeyboardAvoidingView>
  );
}
