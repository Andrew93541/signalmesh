import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';

import { addContact } from '@/trackmate/contacts';
import { RELATIONSHIP_LABEL, type Relationship } from '@/trackmate/smsText';
import { Banner, Button, Chip, Screen, Txt, s } from '@/ui/kit';
import { color, space } from '@/ui/theme';

const RELATIONSHIPS = Object.keys(RELATIONSHIP_LABEL) as Relationship[];

export default function NewContact() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('FAMILY');
  const [error, setError] = useState<string | null>(null);

  function save() {
    const problem = addContact({ name, phone, relationship });
    if (problem) setError(problem);
    else router.back();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ gap: space.xs }}>
          <Txt v="headline">Name</Txt>
          <TextInput accessibilityLabel="Contact name" style={s.input} value={name} maxLength={60}
            onChangeText={(t) => { setName(t); setError(null); }} placeholder="e.g. Asha (sister)" placeholderTextColor={color.text3} />
        </View>

        <View style={{ gap: space.xs }}>
          <Txt v="headline">Mobile number</Txt>
          <TextInput accessibilityLabel="Mobile number" style={s.input} value={phone} keyboardType="phone-pad" maxLength={20}
            onChangeText={(t) => { setPhone(t); setError(null); }} placeholder="+91 98765 43210" placeholderTextColor={color.text3} />
          <Txt v="footnote" c={color.text2}>Include the country code so texts reach them when you travel.</Txt>
        </View>

        <View style={{ gap: space.s }}>
          <Txt v="headline">Relationship</Txt>
          <View style={s.wrap} accessibilityRole="radiogroup">
            {RELATIONSHIPS.map((r) => (
              <Chip key={r} label={RELATIONSHIP_LABEL[r]} selected={r === relationship} onPress={() => setRelationship(r)} />
            ))}
          </View>
        </View>

        {error ? <Banner tone="critical" icon="error" title={error} /> : null}
        <Button label="Save contact" icon="check_circle" onPress={save} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
