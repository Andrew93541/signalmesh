import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { addDays, createJourney, formatDate, todayLocal, validateJourney, type JourneyType } from '@/trackmate/journeys';
import { prefsStore } from '@/trackmate/prefs';
import { Banner, Button, Chip, Icon, Screen, Section, Txt, s } from '@/ui/kit';
import { color, radius, space } from '@/ui/theme';

const CHECKIN_OPTIONS: (number | null)[] = [null, 15, 30, 60, 120];
const checkinLabel = (m: number | null) => (m === null ? 'Off' : m < 60 ? `${m} min` : `${m / 60} h`);

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.xs }}>
      <Txt v="headline">{label}</Txt>
      {children}
      {hint ? <Txt v="footnote" c={color.text2}>{hint}</Txt> : null}
    </View>
  );
}

function DateStepper({ label, value, onChange, min }: { label: string; value: string; onChange: (d: string) => void; min?: string }) {
  const canBack = !min || addDays(value, -1) >= min;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, borderWidth: 1, borderColor: color.borderStrong, borderRadius: radius.s, minHeight: 52 }}>
      <Pressable onPress={() => canBack && onChange(addDays(value, -1))} disabled={!canBack}
        accessibilityRole="button" accessibilityLabel={`${label}: one day earlier`}
        style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center', opacity: canBack ? 1 : 0.3 }}>
        <Icon name="remove" sf="minus" tint={color.primary} />
      </Pressable>
      <Txt v="body" center style={{ flex: 1 }} >{formatDate(value)}</Txt>
      <Pressable onPress={() => onChange(addDays(value, 1))}
        accessibilityRole="button" accessibilityLabel={`${label}: one day later`}
        style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="add" sf="plus" tint={color.primary} />
      </Pressable>
    </View>
  );
}

export default function NewJourney() {
  const params = useLocalSearchParams<{ type?: string }>();
  const initialType: JourneyType = params.type === 'TREK' || params.type === 'TRIP'
    ? params.type : prefsStore.get().mode === 'TREKKER' ? 'TREK' : 'TRIP';

  const [type, setType] = useState<JourneyType>(initialType);
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(todayLocal());
  const [multiDay, setMultiDay] = useState(false);
  const [endDate, setEndDate] = useState(todayLocal(1));
  const [checkinMinutes, setCheckinMinutes] = useState<number | null>(initialType === 'TREK' ? 30 : null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trek = type === 'TREK';
  const draft = {
    type, title, destination: destination || null, startDate,
    endDate: multiDay ? (endDate < startDate ? startDate : endDate) : null,
    notes: notes || null, checkinMinutes,
  };

  function save() {
    const problem = validateJourney(draft);
    if (problem) {
      setError(problem);
      return;
    }
    const j = createJourney(draft);
    router.replace({ pathname: '/journey/[id]', params: { id: j.id } });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Section>
          <Txt v="headline">Type</Txt>
          <View style={s.wrap} accessibilityRole="radiogroup">
            <Chip label="Trip" icon="luggage" selected={!trek} onPress={() => { setType('TRIP'); }} />
            <Chip label="Trek" icon="hiking" selected={trek} onPress={() => { setType('TREK'); if (checkinMinutes === null) setCheckinMinutes(30); }} />
          </View>
        </Section>

        <Field label="Name" hint={trek ? 'e.g. "Triund day hike"' : 'e.g. "Goa long weekend"'}>
          <TextInput
            accessibilityLabel="Journey name"
            style={s.input}
            value={title}
            onChangeText={(t) => { setTitle(t); setError(null); }}
            maxLength={80}
            placeholder={trek ? 'Name your trek' : 'Name your trip'}
            placeholderTextColor={color.text3}
            returnKeyType="next"
          />
        </Field>

        <Field label={trek ? 'Trail or destination' : 'Destination'} hint="Optional">
          <TextInput
            accessibilityLabel={trek ? 'Trail or destination' : 'Destination'}
            style={s.input}
            value={destination}
            onChangeText={setDestination}
            maxLength={120}
            placeholder={trek ? 'Where are you heading?' : 'City, place or region'}
            placeholderTextColor={color.text3}
          />
        </Field>

        <Field label="Start date">
          <DateStepper label="Start date" value={startDate} onChange={(d) => { setStartDate(d); if (endDate < d) setEndDate(d); }} />
        </Field>

        <Section>
          <View style={s.wrap} accessibilityRole="radiogroup">
            <Chip label="Single day" selected={!multiDay} onPress={() => setMultiDay(false)} />
            <Chip label="Several days" selected={multiDay} onPress={() => setMultiDay(true)} />
          </View>
          {multiDay ? (
            <Field label="End date">
              <DateStepper label="End date" value={endDate < startDate ? startDate : endDate} onChange={setEndDate} min={startDate} />
            </Field>
          ) : null}
        </Section>

        <Field label="Safety check-in" hint={checkinMinutes === null
          ? 'No check-in reminders for this journey.'
          : `While tracking, TrackMate will ask "Are you safe?" every ${checkinLabel(checkinMinutes)}. If you miss one, the safety station is alerted.`}>
          <View style={s.wrap} accessibilityRole="radiogroup">
            {CHECKIN_OPTIONS.map((m) => (
              <Chip key={String(m)} label={checkinLabel(m)} selected={checkinMinutes === m} onPress={() => setCheckinMinutes(m)} />
            ))}
          </View>
        </Field>

        <Field label="Notes" hint="Optional. Route details, meeting points, who you're with.">
          <TextInput
            accessibilityLabel="Notes"
            style={[s.input, { minHeight: 100, paddingTop: space.m, textAlignVertical: 'top' }]}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={1000}
            placeholderTextColor={color.text3}
          />
        </Field>

        {error ? <Banner tone="critical" icon="error" title={error} /> : null}

        <Button label={trek ? 'Save trek' : 'Save trip'} icon="check_circle" onPress={save} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
