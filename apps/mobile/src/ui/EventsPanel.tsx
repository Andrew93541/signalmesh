import { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { useStore } from '@/lib/store';
import { ApiError, sessionStore } from '@/trackmate/auth';
import {
  DIFFICULTY_LABEL, listCategories, listEvents, listMyEvents, type Category, type DiscoverFilters, type Difficulty, type TmEvent,
} from '@/trackmate/events';
import { savePrefs } from '@/trackmate/prefs';
import { EventCard } from '@/ui/EventCard';
import { Banner, Button, Chip, EmptyState, Icon, Txt, s } from '@/ui/kit';
import { color, space } from '@/ui/theme';

type Tab = 'DISCOVER' | 'MINE' | 'APPLIED';
type Load<T> = { key: string; data?: T; error?: string };

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Pull down to try again.');
const DIFFICULTIES = Object.keys(DIFFICULTY_LABEL) as Difficulty[];
const DATES: [NonNullable<DiscoverFilters['date']>, string][] = [['ANY', 'Any date'], ['WEEK', 'Next 7 days'], ['MONTH', 'Next 30 days']];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Loads `fn` whenever `key` changes or `tick` bumps. Loading = the result belongs to an older key. */
function useLoad<T>(key: string, tick: number, fn: () => Promise<T>): Load<T> & { loading: boolean } {
  const [res, setRes] = useState<Load<T>>({ key: '' });
  useEffect(() => {
    let live = true;
    fn().then((data) => live && setRes({ key: `${key}#${tick}`, data }), (e) => live && setRes({ key: `${key}#${tick}`, error: msg(e) }));
    return () => { live = false; };
    // fn is derived from key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  return { ...res, loading: res.key !== `${key}#${tick}` };
}

function SearchBox({ value, onChange, placeholder, icon, label }: { value: string; onChange: (v: string) => void; placeholder: string; icon: 'search' | 'location_on'; label: string }) {
  return (
    <View style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingVertical: 0 }]}>
      <Icon name={icon} size={20} tint={color.text2} />
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={color.text3}
        style={{ flex: 1, color: color.text, fontSize: 16, minHeight: 48 }} returnKeyType="search" autoCorrect={false} />
    </View>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingRight: space.l }}>
      {children}
    </ScrollView>
  );
}

function Discover({ tick }: { tick: number }) {
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [date, setDate] = useState<NonNullable<DiscoverFilters['date']>>('ANY');
  const [hasSeats, setHasSeats] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const dq = useDebounced(q, 400);
  const dl = useDebounced(location, 400);

  const cats = useLoad<Category[]>('categories', tick, listCategories);
  const filters: DiscoverFilters = useMemo(() => ({ q: dq, location: dl, category, difficulty, date, hasSeats }), [dq, dl, category, difficulty, date, hasSeats]);
  const events = useLoad<TmEvent[]>(JSON.stringify(filters), tick, () => listEvents(filters));
  const filtered = !!(dq.trim() || dl.trim() || category || difficulty || date !== 'ANY' || hasSeats);

  return (
    <View style={{ gap: space.l }}>
      <SearchBox icon="search" label="Search events" value={q} onChange={setQ} placeholder="Search treks, walks, camps…" />
      <ChipRow>
        <Chip label="All" selected={!category} onPress={() => setCategory(null)} />
        {(cats.data ?? []).map((c) => <Chip key={c.code} label={c.label} selected={category === c.code} onPress={() => setCategory(category === c.code ? null : c.code)} />)}
      </ChipRow>
      <ChipRow>
        <Chip label="More filters" icon="tune" selected={showMore} onPress={() => setShowMore(!showMore)} />
        <Chip label="Seats available" icon="group" selected={hasSeats} onPress={() => setHasSeats(!hasSeats)} />
        {DATES.map(([k, l]) => <Chip key={k} label={l} selected={date === k} onPress={() => setDate(k)} />)}
      </ChipRow>
      {showMore ? (
        <View style={{ gap: space.m }}>
          <SearchBox icon="location_on" label="Filter by location" value={location} onChange={setLocation} placeholder="Town, trailhead or destination" />
          <ChipRow>
            <Chip label="Any difficulty" selected={!difficulty} onPress={() => setDifficulty(null)} />
            {DIFFICULTIES.map((d) => <Chip key={d} label={DIFFICULTY_LABEL[d]} selected={difficulty === d} onPress={() => setDifficulty(difficulty === d ? null : d)} />)}
          </ChipRow>
        </View>
      ) : null}

      {events.error ? <Banner tone="critical" icon="cloud_off" title="Couldn't load events" body={events.error} /> : null}
      {events.loading && !events.data ? <Txt v="callout" c={color.text2}>Loading events…</Txt> : null}
      {events.data && events.data.length === 0 ? (
        <EmptyState icon="event_busy" title={filtered ? 'No events match these filters' : 'No events published yet'}
          body={filtered ? 'Try a different date, place or category.' : 'When organizers publish treks, walks and camps, they will appear here. Check back soon.'}
          action={filtered ? <Button kind="secondary" label="Clear filters" onPress={() => { setQ(''); setLocation(''); setCategory(null); setDifficulty(null); setDate('ANY'); setHasSeats(false); }} /> : undefined} />
      ) : null}
      {(events.data ?? []).map((e) => <EventCard key={e.id} e={e} />)}
    </View>
  );
}

function MyEvents({ tick }: { tick: number }) {
  const { session } = useStore(sessionStore);
  const mine = useLoad<TmEvent[]>(session ? `mine:${session.user.id}` : 'mine:none', tick, () => (session ? listMyEvents() : Promise.resolve([])));
  if (!session) {
    return (
      <EmptyState icon="person" title="Sign in to organize events" body="Events you create and their review status show up here."
        action={<Button label="Sign in or create an account" onPress={() => savePrefs({ guest: false })} />} />
    );
  }
  return (
    <View style={{ gap: space.l }}>
      <Banner tone="info" icon="info" title="Creating events comes in the next update"
        body="You'll be able to draft an event, submit it for review and see the decision here." />
      {mine.error ? <Banner tone="critical" icon="cloud_off" title="Couldn't load your events" body={mine.error} /> : null}
      {mine.loading && !mine.data ? <Txt v="callout" c={color.text2}>Loading…</Txt> : null}
      {mine.data && mine.data.length === 0 ? (
        <EmptyState icon="edit_calendar" title="No events yet" body="Drafts, events in review and published events you organize will be listed here." />
      ) : null}
      {(mine.data ?? []).map((e) => <EventCard key={e.id} e={e} showStatus />)}
    </View>
  );
}

function Applied() {
  return (
    <EmptyState icon="how_to_reg" title="Applications open soon"
      body="You'll be able to apply to events and follow each application (pending, accepted, declined) here in a coming update." />
  );
}

/** Events inside Feed: published events, the user's own events, applications. */
export function EventsPanel({ tick }: { tick: number }) {
  const [tab, setTab] = useState<Tab>('DISCOVER');
  return (
    <View style={{ gap: space.l, paddingHorizontal: space.l }}>
      <View style={s.wrap} accessibilityRole="tablist">
        {([['DISCOVER', 'Upcoming'], ['MINE', 'My Events'], ['APPLIED', 'Applied']] as [Tab, string][]).map(([k, l]) => (
          <Chip key={k} label={l} selected={tab === k} onPress={() => setTab(k)} />
        ))}
      </View>
      {tab === 'DISCOVER' ? <Discover tick={tick} /> : tab === 'MINE' ? <MyEvents tick={tick} /> : <Applied />}
    </View>
  );
}
