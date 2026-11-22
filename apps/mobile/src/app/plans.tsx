import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { useStore } from '@/lib/store';
import { ApiError, api, sessionStore } from '@/trackmate/auth';
import { formatPrice } from '@/trackmate/eventFormat';
import { journeysStore } from '@/trackmate/journeys';
import { Banner, Button, Card, Chip, Icon, Screen, Section, Txt, s } from '@/ui/kit';
import { color, radius, space } from '@/ui/theme';

interface Product { code: string; name: string; description: string; price_minor: number; currency: string; billing: 'PER_TRIP'; includes: string[] }
interface Plans { free: { features: string[] }; premium: { products: Product[] }; payment_provider: string | null }
interface Entitlement { id: string; trip_ref: string; product_code: string; status: string; payment_status: string; valid_from: string | null; valid_until: string | null }

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');
const STATUS: Record<string, string> = { PENDING_PAYMENT: 'Waiting for payment (payments not set up)', ACTIVE: 'Active', CANCELLED: 'Cancelled', EXPIRED: 'Expired' };

export default function PlansScreen() {
  const { session } = useStore(sessionStore);
  const journeys = useStore(journeysStore).filter((j) => j.status !== 'COMPLETED');
  const [plans, setPlans] = useState<Plans | null>(null);
  const [ents, setEnts] = useState<Entitlement[]>([]);
  const [trip, setTrip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tripId = trip ?? journeys[0]?.id ?? null;

  const load = useCallback(() => {
    api<Plans>('/v1/plans').then(setPlans, (e) => setError(msg(e)));
    if (session) api<Entitlement[]>('/v1/users/me/entitlements', {}, session.token).then(setEnts, () => {});
  }, [session]);
  useEffect(load, [load]);

  async function choose(p: Product) {
    if (!session) return Alert.alert('Sign in first', 'Premium options are linked to your account.');
    if (!tripId) return Alert.alert('Plan a trek first', 'Per-trip options apply to one trek.', [{ text: 'OK' }, { text: 'Plan a trek', onPress: () => router.push('/journey/new') }]);
    try {
      const r = await api<Entitlement & { message: string }>('/v1/users/me/entitlements', { method: 'POST', body: JSON.stringify({ product_code: p.code, trip_ref: tripId }) }, session.token);
      Alert.alert('Not charged', r.message);
      load();
    } catch (e) { Alert.alert('Not added', msg(e)); }
  }

  const name = (ref: string) => journeys.find((j) => j.id === ref)?.title ?? `trip ${ref.slice(0, 6)}`;

  return (
    <Screen>
      {error ? <Banner tone="critical" icon="cloud_off" title="Couldn't load plans" body={error} /> : null}

      <Card tone="surface">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <Icon name="verified_user" tint={color.primary} />
          <Txt v="title2" style={{ flex: 1 }}>Free</Txt>
          <Txt v="title2" c={color.primary}>₹0</Txt>
        </View>
        {(plans?.free.features ?? []).map((f) => (
          <View key={f} style={{ flexDirection: 'row', gap: space.s }}>
            <Icon name="check" size={18} tint={color.success} />
            <Txt v="callout" style={{ flex: 1 }}>{f}</Txt>
          </View>
        ))}
        <Txt v="footnote" c={color.primary} style={{ fontWeight: '700' }}>Receiving SOS alerts and relaying SOS are always free.</Txt>
      </Card>

      <Section title="Premium · per trip">
        <Txt v="footnote" c={color.text2}>Pay only for the treks you choose. No monthly or yearly subscription.</Txt>
        {journeys.length ? (
          <View style={{ gap: space.xs }}>
            <Txt v="headline">For which trek?</Txt>
            <View style={s.wrap}>{journeys.map((j) => <Chip key={j.id} label={j.title} selected={tripId === j.id} onPress={() => setTrip(j.id)} />)}</View>
          </View>
        ) : <Txt v="callout" c={color.text2}>Plan a trek to choose Premium options for it.</Txt>}
        {(plans?.premium.products ?? []).map((p) => (
          <View key={p.code} style={{ borderWidth: p.code === 'TRIP_BUNDLE' ? 2 : 1, borderColor: p.code === 'TRIP_BUNDLE' ? color.accent : color.border, borderRadius: radius.l, padding: space.l, gap: space.s }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
              <Txt v="headline" style={{ flex: 1 }}>{p.name}</Txt>
              <Txt v="title2" c={color.primary}>{formatPrice(p.price_minor, p.currency)}</Txt>
            </View>
            <Txt v="caption" c={color.accentText} style={{ fontWeight: '700' }}>PER TRIP{p.code === 'TRIP_BUNDLE' ? ' · BEST VALUE' : ''}</Txt>
            <Txt v="callout" c={color.text2}>{p.description}</Txt>
            <Button compact kind={p.code === 'TRIP_BUNDLE' ? 'primary' : 'secondary'} label={`Choose for ${formatPrice(p.price_minor, p.currency)}`} onPress={() => void choose(p)} />
          </View>
        ))}
        <Banner tone="info" icon="info" title="Payments are not set up yet"
          body="Choosing an option records your request but does not charge you, and it does not unlock anything until payment is available." />
      </Section>

      {ents.length ? (
        <Section title="Your trip access">
          <Card>
            {ents.map((e) => (
              <View key={e.id} style={{ gap: 2, paddingVertical: space.xs }}>
                <Txt v="headline">{plans?.premium.products.find((p) => p.code === e.product_code)?.name ?? e.product_code} · {name(e.trip_ref)}</Txt>
                <Txt v="footnote" c={e.status === 'ACTIVE' ? color.success : color.text2}>
                  {STATUS[e.status] ?? e.status}{e.valid_until ? ` · valid until ${new Date(e.valid_until).toLocaleDateString()}` : ''}
                </Txt>
                {e.status === 'PENDING_PAYMENT' ? (
                  <Button compact kind="tertiary" label="Cancel request" onPress={() => void api(`/v1/users/me/entitlements/${e.id}`, { method: 'DELETE' }, session!.token).then(load, (x) => Alert.alert(msg(x)))} />
                ) : null}
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

