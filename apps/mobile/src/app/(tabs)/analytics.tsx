import { useFocusEffect } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useMemo, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Health, type HealthDay, type HealthMetric, type HealthSession } from '../../../modules/signalmesh-nearby/health';

import { fmtDistance, fmtDuration, goalProgress, gpsByDay, sourceName, weekEnding, ymd } from '@/lib/activityFormat';
import { useStore } from '@/lib/store';
import { journeysStore } from '@/trackmate/journeys';
import { Banner, Button, Card, Chip, Icon, Txt, s } from '@/ui/kit';
import { color, radius, space } from '@/ui/theme';

type HcState = { sdk: 'AVAILABLE' | 'UPDATE_REQUIRED' | 'UNAVAILABLE' | 'MISSING'; granted: HealthMetric[] };
const GOALS = [6000, 8000, 10000];
const GOAL_KEY = 'trackmate.stepGoal';
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

function Metric({ icon, label, value, note, tint = color.primary }: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: string; note?: string; tint?: string }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: color.surface, borderRadius: radius.l, padding: space.m, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <Icon name={icon} size={18} tint={tint} />
        <Txt v="footnote" c={color.text2}>{label}</Txt>
      </View>
      <Txt v="title1" style={{ fontVariant: ['tabular-nums'] }}>{value}</Txt>
      {note ? <Txt v="caption" c={color.text2}>{note}</Txt> : null}
    </View>
  );
}

function Bars({ days, values, selected, onSelect, unit }: { days: string[]; values: (number | null)[]; selected: string; onSelect: (d: string) => void; unit: string }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s, height: 150 }} accessibilityLabel={`Weekly ${unit}`}>
      {days.map((d, i) => {
        const v = values[i];
        const sel = d === selected;
        return (
          <Pressable key={d} onPress={() => onSelect(d)} style={{ flex: 1, alignItems: 'center', gap: 4 }}
            accessibilityRole="button" accessibilityLabel={`${dayLabel(d)}: ${v === null ? 'no data' : `${Math.round(v)} ${unit}`}`}>
            <View style={{ height: 110, width: '100%', justifyContent: 'flex-end' }}>
              <View style={{ height: v ? Math.max(4, (v / max) * 110) : 2, borderRadius: 6, backgroundColor: v === null ? color.border : sel ? color.primary : color.leaf }} />
            </View>
            <Txt v="caption" c={sel ? color.primary : color.text2} style={{ fontWeight: sel ? '800' : '400' }}>{dayLabel(d)}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Analytics() {
  const insets = useSafeAreaInsets();
  const journeys = useStore(journeysStore);
  const [selected, setSelected] = useState(ymd(new Date()));
  const [hc, setHc] = useState<HcState | null>(null);
  const [days, setDays] = useState<HealthDay[]>([]);
  const [sessions, setSessions] = useState<HealthSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [goal, setGoal] = useState(() => Number(Storage.getItemSync(GOAL_KEY)) || 8000);

  const week = useMemo(() => weekEnding(new Date(`${selected}T12:00:00`)), [selected]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!Health) { setHc({ sdk: 'MISSING', granted: [] }); return; }
      const st = await Health.status();
      setHc(st);
      if (st.sdk === 'AVAILABLE' && st.granted.length) {
        setDays(await Health.daily(week[0], 7));
        setSessions(st.granted.includes('EXERCISE') ? await Health.sessions(14) : []);
      } else { setDays([]); setSessions([]); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read Health Connect.');
    } finally { setLoading(false); }
  }, [week]);

  useFocusEffect(useCallback(() => {
    void load();
    const sub = AppState.addEventListener('change', (a) => a === 'active' && void load()); // back from Health Connect settings
    return () => sub.remove();
  }, [load]));

  const day = days.find((d) => d.date === selected) ?? null;
  const gpsWeek = gpsByDay(journeys, week);
  const gps = gpsWeek.find((d) => d.date === selected)!;
  const granted = new Set(hc?.granted ?? []);
  const kcal = day?.active_kcal ?? null;
  const sources = [...new Set(days.flatMap((d) => d.sources))].map(sourceName);
  const recentTreks = journeys.filter((j) => j.startedAt).slice(0, 5);

  const [connectError, setConnectError] = useState<string | null>(null);
  async function connect() {
    if (!Health) return;
    setConnectError(null);
    try {
      const got = await Health.requestPermissions();
      if (!got.length) setConnectError('No access was given. You can switch it on in Health Connect instead.');
    } catch (e) {
      setConnectError(`Android didn't show the permission screen (${e instanceof Error ? e.message : String(e)}). Use the button below to switch access on in Health Connect.`);
    } finally { void load(); }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ paddingHorizontal: space.l, paddingTop: insets.top + space.l, paddingBottom: insets.bottom + 96, gap: space.xl }}
      refreshControl={<RefreshControl refreshing={loading} colors={[color.primary]} onRefresh={() => void load()} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt v="title1" style={{ flex: 1 }}>Analytics</Txt>
        <Pressable onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Refresh" hitSlop={12}>
          <Icon name="refresh" tint={color.primary} />
        </Pressable>
      </View>

      {/* Date selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
        {weekEnding(new Date()).map((d) => (
          <Chip key={d} label={d === ymd(new Date()) ? 'Today' : `${dayLabel(d)} ${Number(d.slice(8))}`} selected={selected === d} onPress={() => setSelected(d)} />
        ))}
      </ScrollView>

      {/* Health Connect status */}
      {hc?.sdk === 'MISSING' ? <Banner tone="warning" icon="info" title="This build has no Health Connect support" /> : null}
      {hc?.sdk === 'UNAVAILABLE' ? (
        <Banner tone="info" icon="health_metrics" title="Health Connect isn't available on this phone"
          body="Steps and calories come from Health Connect. You can still see trek distance and time recorded by TrackMate below." />
      ) : null}
      {hc?.sdk === 'UPDATE_REQUIRED' ? <Banner tone="warning" icon="system_update" title="Health Connect needs an update" body="Update it from the Play Store, then come back." /> : null}
      {hc?.sdk === 'AVAILABLE' && granted.size === 0 ? (
        <Card tone="surface">
          <Txt v="headline">Connect Health Connect</Txt>
          <Txt v="callout" c={color.text2}>TrackMate can read your steps, distance, calories and workouts, read-only. They stay on your phone. Health access is optional: SOS and the rest of TrackMate work without it.</Txt>
          <Button label="Allow access" icon="favorite" onPress={() => void connect()} />
          {connectError ? <Txt v="footnote" c={color.sosText}>{connectError}</Txt> : null}
          <Button kind="secondary" label="Open Health Connect permissions" onPress={() => Health?.openAppPermissions()} />
          <Txt v="caption" c={color.text2}>In Health Connect, choose TrackMate and switch on Steps, Distance, Calories and Exercise. Then come back here.</Txt>
        </Card>
      ) : null}
      {hc?.sdk === 'AVAILABLE' && granted.size > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <Icon name="check_circle" size={18} tint={color.success} />
          <Txt v="footnote" c={color.text2} style={{ flex: 1 }}>
            Health Connect: {granted.size} of 5 data types allowed{sources.length ? ` · data from ${sources.join(', ')}` : ''}
          </Txt>
          <Button compact kind="tertiary" label="Manage" onPress={() => Health?.openSettings()} />
        </View>
      ) : null}
      {error ? <Banner tone="critical" icon="error" title="Couldn't read Health Connect" body={error} /> : null}

      {/* Daily summary */}
      <View style={{ gap: space.m }}>
        <Txt v="title2">{selected === ymd(new Date()) ? 'Today' : new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</Txt>
        {granted.has('STEPS') ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
              <Txt v="display" style={{ fontVariant: ['tabular-nums'] }}>{day?.steps != null ? Math.round(day.steps).toLocaleString() : '—'}</Txt>
              <Txt v="callout" c={color.text2}>of {goal.toLocaleString()} steps</Txt>
            </View>
            <View style={{ height: 12, borderRadius: 6, backgroundColor: color.surface2, overflow: 'hidden' }} accessibilityLabel={`Goal progress ${Math.round(goalProgress(day?.steps ?? null, goal) * 100)}%`}>
              <View style={{ height: 12, width: `${goalProgress(day?.steps ?? null, goal) * 100}%`, backgroundColor: color.primary }} />
            </View>
            <View style={s.wrap}>
              {GOALS.map((g) => <Chip key={g} label={`Goal ${g / 1000}k`} selected={goal === g} onPress={() => { setGoal(g); Storage.setItemSync(GOAL_KEY, String(g)); }} />)}
            </View>
          </Card>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          <Metric icon="directions_walk" label="Distance walked" value={granted.has('DISTANCE') ? fmtDistance(day?.distance_m ?? null) : '—'}
            note={granted.has('DISTANCE') ? 'Health Connect' : 'Not connected'} />
          <Metric icon="local_fire_department" tint={color.accent} label="Calories burned"
            value={granted.has('ACTIVE_CALORIES') && kcal != null ? `${Math.round(kcal)} kcal` : granted.has('TOTAL_CALORIES') && day?.total_kcal != null ? `${Math.round(day.total_kcal)} kcal` : '—'}
            note={granted.has('ACTIVE_CALORIES') && kcal != null ? 'Active, from Health Connect' : granted.has('TOTAL_CALORIES') && day?.total_kcal != null ? 'Total incl. resting, from Health Connect' : 'No data, not estimated'} />
          <Metric icon="timer" label="Active minutes" value={granted.has('EXERCISE') && day?.exercise_min != null ? `${Math.round(day.exercise_min)} min` : '—'}
            note={granted.has('EXERCISE') ? 'Logged workouts, Health Connect' : 'Not connected'} />
          <Metric icon="hiking" label="Trek time" value={gps.duration_ms ? fmtDuration(gps.duration_ms) : '—'}
            note={gps.treks ? `${gps.treks} trek${gps.treks > 1 ? 's' : ''} · ${fmtDistance(gps.distance_m)} by TrackMate GPS` : 'TrackMate GPS · no trek this day'} />
        </View>
      </View>

      {/* Weekly trends */}
      <View style={{ gap: space.m }}>
        <Txt v="title2">This week</Txt>
        {granted.has('STEPS') ? (
          <Card>
            <Txt v="headline">Steps <Txt v="footnote" c={color.text2}>· Health Connect</Txt></Txt>
            <Bars days={week} values={week.map((d) => days.find((x) => x.date === d)?.steps ?? null)} selected={selected} onSelect={setSelected} unit="steps" />
          </Card>
        ) : null}
        <Card>
          <Txt v="headline">Trek distance <Txt v="footnote" c={color.text2}>· TrackMate GPS</Txt></Txt>
          {gpsWeek.some((d) => d.distance_m > 0) ? (
            <Bars days={week} values={gpsWeek.map((d) => (d.treks ? d.distance_m / 1000 : null))} selected={selected} onSelect={setSelected} unit="km" />
          ) : <Txt v="callout" c={color.text2}>No treks recorded this week. Start one from Home to see your route distance here.</Txt>}
        </Card>
      </View>

      {/* Recent activity */}
      <View style={{ gap: space.m }}>
        <Txt v="title2">Recent activity</Txt>
        {sessions.length === 0 && recentTreks.length === 0 ? (
          <Txt v="callout" c={color.text2}>Nothing yet. Workouts from Health Connect and treks recorded by TrackMate appear here.</Txt>
        ) : null}
        {recentTreks.map((j) => (
          <View key={j.id} style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
            <Icon name="hiking" tint={color.primary} />
            <View style={{ flex: 1 }}>
              <Txt v="headline">{j.title}</Txt>
              <Txt v="footnote" c={color.text2}>{new Date(j.startedAt!).toLocaleDateString()} · {fmtDistance(j.distanceM)} · {fmtDuration(j.elapsedMs)} · TrackMate GPS</Txt>
            </View>
          </View>
        ))}
        {sessions.slice(0, 8).map((x) => (
          <View key={`${x.start}${x.source}`} style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
            <Icon name="fitness_center" tint={color.accent} />
            <View style={{ flex: 1 }}>
              <Txt v="headline">{x.title || 'Workout'}</Txt>
              <Txt v="footnote" c={color.text2}>{new Date(x.start).toLocaleString()} · {fmtDuration(Date.parse(x.end) - Date.parse(x.start))} · {sourceName(x.source)}</Txt>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
