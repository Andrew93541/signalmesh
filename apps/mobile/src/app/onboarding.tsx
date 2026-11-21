import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { savePrefs } from '@/trackmate/prefs';
import { Button, Icon, Txt } from '@/ui/kit';
import { Logo } from '@/ui/Logo';
import { color, radius, space } from '@/ui/theme';

type IconName = 'map' | 'hiking' | 'my_location' | 'contacts' | 'timer' | 'cell_tower' | 'sos' | 'sms' | 'wifi';

const PAGES: { title: string; body: string; points: [IconName, string, string][] }[] = [
  {
    title: 'Explore confidently',
    body: 'Plan where you are going and keep a record of the way.',
    points: [
      ['map', 'Plan your journeys', 'Destinations, dates and notes in one place.'],
      ['hiking', 'Tourist or trekker', 'Pick the mode that fits your trip. Switch any time.'],
      ['my_location', 'GPS tracking', 'See your location, time and distance while you move.'],
    ],
  },
  {
    title: 'Stay connected',
    body: 'Keep the people you trust in the loop.',
    points: [
      ['contacts', 'Trusted contacts', 'Choose who you can reach quickly in an emergency.'],
      ['timer', 'Check-in reminders', 'A timer asks "Are you OK?" and alerts the safety station if you miss it.'],
      ['cell_tower', 'Help from nearby phones', 'Messages can pass through other TrackMate phones on the same Wi-Fi when you have no connection (SignalMesh).'],
    ],
  },
  {
    title: 'Stay safer outdoors',
    body: 'Ask for help in a way that is honest about what happened.',
    points: [
      ['sos', 'SOS', 'Press and hold to send your location. It is saved on your phone first, so it is never lost.'],
      ['sms', 'Text your contacts', 'One tap opens a message with your location to your trusted contacts.'],
      ['wifi', 'Every route available', 'Internet, a nearby phone or SMS. TrackMate shows exactly how far your message got.'],
    ],
  },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const p = PAGES[page];
  const last = page === PAGES.length - 1;
  const finish = () => savePrefs({ onboardingDone: true });

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l, paddingHorizontal: space.xxl }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 }}>
        <Txt v="footnote" c={color.text2}>{page + 1} of {PAGES.length}</Txt>
        {!last ? <Button label="Skip" kind="tertiary" compact onPress={finish} /> : null}
      </View>

      <View style={{ alignItems: 'center', marginTop: space.s }}>
        <Logo size={page === 0 ? 150 : 96} />
      </View>

      <View style={{ gap: space.s, marginTop: space.xl }} accessibilityLiveRegion="polite">
        <Txt v="title1">{p.title}</Txt>
        <Txt v="body" c={color.text2}>{p.body}</Txt>
      </View>

      <View style={{ gap: space.l, marginTop: space.xxl, flex: 1 }}>
        {p.points.map(([icon, title, body]) => (
          <View key={title} style={{ flexDirection: 'row', gap: space.l, alignItems: 'flex-start' }}>
            <View style={{ width: 48, height: 48, borderRadius: radius.m, backgroundColor: icon === 'sos' ? color.sosSoft : color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={icon} size={26} tint={icon === 'sos' ? color.sosText : color.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="headline">{title}</Txt>
              <Txt v="callout" c={color.text2}>{body}</Txt>
            </View>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.s, marginVertical: space.l }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {PAGES.map((_, i) => (
          <View key={i} style={{ width: i === page ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i === page ? color.accent : color.border }} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: space.m }}>
        {page > 0 ? <View style={{ flex: 1 }}><Button label="Back" kind="secondary" onPress={() => setPage(page - 1)} /></View> : null}
        <View style={{ flex: 2 }}>
          <Button label={last ? 'Get started' : 'Continue'} onPress={() => (last ? finish() : setPage(page + 1))} />
        </View>
      </View>
    </View>
  );
}
