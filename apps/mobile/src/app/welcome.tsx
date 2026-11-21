import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setMode, type Mode } from '@/trackmate/prefs';
import { Button, Icon, Txt } from '@/ui/kit';
import { color, radius, space } from '@/ui/theme';

const OPTIONS: { mode: Mode; icon: 'luggage' | 'hiking'; title: string; body: string }[] = [
  { mode: 'TOURIST', icon: 'luggage', title: 'Tourist', body: 'Plan trips and itineraries, share your journey with people you trust.' },
  { mode: 'TREKKER', icon: 'hiking', title: 'Trekker', body: 'Plan treks, track distance and time, and set safety check-ins.' },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [choice, setChoice] = useState<Mode | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + space.x4, paddingBottom: insets.bottom + space.xxl, paddingHorizontal: space.xxl, gap: space.xxl }}>
      <View style={{ gap: space.s }}>
        <Txt v="display">TrackMate</Txt>
        <Txt v="body" c={color.text2}>Travel and trek with confidence. Plan your journeys, track your route and ask for help when you need it.</Txt>
      </View>

      <View style={{ gap: space.m }} accessibilityRole="radiogroup">
        <Txt v="headline">How will you mostly use TrackMate?</Txt>
        {OPTIONS.map((o) => {
          const selected = choice === o.mode;
          return (
            <Pressable
              key={o.mode}
              onPress={() => setChoice(o.mode)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${o.title}. ${o.body}`}
              style={{
                flexDirection: 'row', gap: space.l, alignItems: 'center', padding: space.l, borderRadius: radius.m,
                borderWidth: selected ? 2 : 1, borderColor: selected ? color.primary : color.borderStrong,
                backgroundColor: selected ? color.primarySoft : color.bg,
              }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: selected ? color.bg : color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={o.icon} size={26} tint={color.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="title2">{o.title}</Txt>
                <Txt v="footnote" c={color.text2}>{o.body}</Txt>
              </View>
            </Pressable>
          );
        })}
        <Txt v="footnote" c={color.text2}>You can switch any time in Profile.</Txt>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
        <Icon name="health_and_safety" size={20} tint={color.success} />
        <Txt v="footnote" c={color.text2} style={{ flex: 1 }}>SOS works without an account and is free on every plan.</Txt>
      </View>
      <Button label="Continue" onPress={() => choice && setMode(choice)} disabled={!choice} />
    </View>
  );
}
