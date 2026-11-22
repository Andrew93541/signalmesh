import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, AppState, Linking, PermissionsAndroid, Platform, View } from 'react-native';

import { Nearby } from '../../../modules/signalmesh-nearby';

import { useStore } from '@/lib/store';
import { contactsStore } from '@/trackmate/contacts';
import { pullSafetyPrefs, safetyStore, saveSafetyPrefs, type SafetyPrefs } from '@/trackmate/safetyPrefs';
import { Banner, Button, Card, Icon, Screen, Section, SwitchRow, Txt } from '@/ui/kit';
import { color, space } from '@/ui/theme';

type Perm = 'granted' | 'denied' | 'not_asked' | 'n/a';
interface Perms { notifications: Perm; location: Perm; nearby: Perm; dnd: boolean | null }

async function readPerms(): Promise<Perms> {
  const v = Number(Platform.Version);
  const P = PermissionsAndroid.PERMISSIONS;
  const notif = v >= 33 ? ((await PermissionsAndroid.check(P.POST_NOTIFICATIONS)) ? 'granted' : 'denied')
    : (Nearby?.alertStatus().notificationsEnabled === false ? 'denied' : 'granted');
  const loc = await Location.getForegroundPermissionsAsync().catch(() => null);
  const nearby = v >= 31 ? ((await PermissionsAndroid.check(P.BLUETOOTH_SCAN)) && (await PermissionsAndroid.check(P.BLUETOOTH_CONNECT)) ? 'granted' : 'denied') : 'granted';
  return {
    notifications: notif,
    location: !loc ? 'n/a' : loc.granted ? 'granted' : loc.canAskAgain && loc.status === 'undetermined' ? 'not_asked' : 'denied',
    nearby,
    dnd: Nearby ? Nearby.alertStatus().dndActive : null,
  };
}

function PermRow({ title, why, state, onRequest, onSettings }: { title: string; why: string; state: Perm; onRequest?: () => void; onSettings?: () => void }) {
  const ok = state === 'granted' || state === 'n/a';
  return (
    <View style={{ gap: space.xs, paddingVertical: space.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <Icon name={ok ? 'check_circle' : 'error'} size={20} tint={ok ? color.success : color.warningText} />
        <Txt v="headline" style={{ flex: 1 }}>{title}</Txt>
        <Txt v="footnote" c={ok ? color.success : color.warningText}>{state === 'granted' ? 'Allowed' : state === 'n/a' ? 'Not needed' : state === 'not_asked' ? 'Not asked yet' : 'Not allowed'}</Txt>
      </View>
      <Txt v="footnote" c={color.text2}>{why}</Txt>
      {!ok ? (
        <View style={{ flexDirection: 'row', gap: space.s }}>
          {onRequest ? <Button compact label="Allow" onPress={onRequest} /> : null}
          {onSettings ? <Button compact kind="secondary" label="Open Android settings" onPress={onSettings} /> : null}
        </View>
      ) : null}
    </View>
  );
}

export default function SafetySettings() {
  const prefs = useStore(safetyStore);
  const contacts = useStore(contactsStore);
  const [perms, setPerms] = useState<Perms | null>(null);
  const refresh = useCallback(() => { void readPerms().then(setPerms); }, []);
  useFocusEffect(useCallback(() => {
    refresh();
    void pullSafetyPrefs();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh()); // back from Android settings
    return () => sub.remove();
  }, [refresh]));

  const toggle = (k: keyof SafetyPrefs) => (v: boolean) => saveSafetyPrefs({ [k]: v });

  function escalation(v: boolean) {
    if (!v) return saveSafetyPrefs({ missed_checkin_escalation: false });
    if (contacts.length === 0) {
      Alert.alert('Add a trusted contact first', 'Escalation needs at least one trusted contact.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Add contact', onPress: () => router.push('/contacts/new') }]);
      return;
    }
    Alert.alert('Turn on missed check-in escalation?',
      `If you miss a check-in during a trek, the safety station sees you as overdue, and TrackMate prompts you to text ${contacts.length === 1 ? contacts[0].name : `your ${contacts.length} trusted contacts`}. Android does not let apps send SMS for you, so you confirm each message.`,
      [{ text: 'Not now', style: 'cancel' }, { text: 'I agree', onPress: () => saveSafetyPrefs({ missed_checkin_escalation: true }) }]);
  }

  return (
    <Screen>
      <Txt c={color.text2}>These are TrackMate&apos;s own settings, on by default where it is safe. They do not grant Android permissions: those are listed below and you allow them yourself.</Txt>

      <Section title="Emergency alerts">
        <Card>
          <SwitchRow title="SOS alerts from nearby phones" subtitle="Pop-up and alert when someone near you sends an SOS. Always free." value={prefs.sos_alerts} onChange={toggle('sos_alerts')} />
          <SwitchRow title="Emergency notification" subtitle="Show a persistent notification for each nearby SOS." value={prefs.emergency_notification} onChange={toggle('emergency_notification')} />
          <SwitchRow title="Emergency sound" subtitle="TrackMate's siren, at your alarm volume." value={prefs.emergency_sound} onChange={toggle('emergency_sound')} />
          <SwitchRow title="Emergency vibration" value={prefs.emergency_vibration} onChange={toggle('emergency_vibration')} />
        </Card>
        <Button kind="tertiary" label="Siren volume and alert history" onPress={() => router.push('/relay')} />
      </Section>

      <Section title="Treks and check-ins">
        <Card>
          <SwitchRow title="GPS tracking during an active trek" subtitle="Records your route and distance while a trek is running. Needs location permission." value={prefs.gps_during_trek} onChange={toggle('gps_during_trek')} />
          <SwitchRow title="Check-in reminders" subtitle="Shows the next check-in on the Safety tab. Phone notifications for reminders are not built yet." value={prefs.checkin_reminders} onChange={toggle('checkin_reminders')} />
          <SwitchRow title="Missed check-in escalation" subtitle={contacts.length ? 'Needs your consent.' : 'Needs a trusted contact and your consent.'} value={prefs.missed_checkin_escalation} onChange={escalation} />
          <SwitchRow title="Offline SOS queue" subtitle="Always on: an SOS is kept on your phone and retried until delivered. It cannot be turned off." value onChange={() => {}} />
          <SwitchRow title="Offer to text trusted contacts after an SOS" subtitle={contacts.length ? `${contacts.length} contact${contacts.length > 1 ? 's' : ''}` : 'Add contacts to use this.'} value={prefs.trusted_contact_notifications} onChange={toggle('trusted_contact_notifications')} />
        </Card>
      </Section>

      <Section title="Android permissions">
        {perms ? (
          <Card>
            <PermRow title="Notifications" why="Needed to show SOS alerts and the siren notification." state={perms.notifications}
              onRequest={Number(Platform.Version) >= 33 ? () => void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).then(refresh) : undefined}
              onSettings={() => Nearby?.openNotificationSettings() ?? Linking.openSettings()} />
            <PermRow title="Location (while using the app)" why="Adds your position to an SOS and records trek routes." state={perms.location}
              onRequest={() => void Location.requestForegroundPermissionsAsync().then(refresh)} onSettings={() => void Linking.openSettings()} />
            <PermRow title="Nearby devices (Bluetooth)" why="Sends and receives SOS with nearby phones when there is no network." state={perms.nearby}
              onRequest={() => void PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE]).then(refresh)}
              onSettings={() => void Linking.openSettings()} />
            <PermRow title="Background location" why="Not requested. TrackMate tracks while it is open or running its listening service." state="n/a" />
            <PermRow title="SMS" why="Not requested. TrackMate opens your messaging app with the text filled in; you press send." state="n/a" />
            <PermRow title="Microphone" why="Not used." state="n/a" />
            <PermRow title="Health Connect" why="Optional, for Analytics. Manage it on the Analytics tab." state="n/a" />
          </Card>
        ) : <Txt c={color.text2}>Checking…</Txt>}
        {perms?.dnd ? <Banner tone="warning" icon="do_not_disturb_on" title="Do Not Disturb is on" body="TrackMate respects it: nearby SOS arrive silently until you turn it off." /> : null}
      </Section>
    </Screen>
  );
}
