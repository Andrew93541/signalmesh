import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';

import { useStore } from '@/lib/store';
import { contactsStore, removeContact, type TrustedContact } from '@/trackmate/contacts';
import { RELATIONSHIP_LABEL } from '@/trackmate/smsText';
import { Button, Card, EmptyState, Icon, Screen, Txt } from '@/ui/kit';
import { color, space } from '@/ui/theme';

function ContactRow({ c }: { c: TrustedContact }) {
  function confirmRemove() {
    Alert.alert(`Remove ${c.name}?`, 'They will no longer be suggested when you text your trusted contacts.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeContact(c.id) },
    ]);
  }
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="headline" c={color.primary}>{c.name.slice(0, 1).toUpperCase()}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="headline">{c.name}</Txt>
          <Txt v="footnote" c={color.text2}>{RELATIONSHIP_LABEL[c.relationship]} · {c.phone}</Txt>
        </View>
        <Pressable onPress={confirmRemove} accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`}
          style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="delete" sf="trash" tint={color.text2} />
        </Pressable>
      </View>
    </Card>
  );
}

export default function TrustedContacts() {
  const contacts = useStore(contactsStore);

  return (
    <Screen>
      <Txt v="body" c={color.text2}>
        People you trust to help in an emergency. After you send an SOS, you can text them your location in one tap.
      </Txt>

      {contacts.length === 0 ? (
        <EmptyState icon="contacts" title="No trusted contacts yet"
          body="Add a family member, friend or your trek organizer."
          action={<Button label="Add a contact" icon="add" onPress={() => router.push('/contacts/new')} />} />
      ) : (
        <>
          {contacts.map((c) => <ContactRow key={c.id} c={c} />)}
          <Button label="Add a contact" kind="secondary" icon="add" onPress={() => router.push('/contacts/new')} />
        </>
      )}

      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Icon name="info" size={18} tint={color.text2} />
        <Txt v="footnote" c={color.text2} style={{ flex: 1 }}>
          Contacts are stored only on this phone. TrackMate never messages them automatically: you see the text and choose to send it from your own messaging app.
        </Txt>
      </View>
    </Screen>
  );
}
