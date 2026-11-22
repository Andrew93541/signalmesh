import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { DIFFICULTY_LABEL, STATUS_LABEL, coverSource, formatDuration, formatPrice, formatWhen, seatsText, type EventStatus, type TmEvent } from '@/trackmate/events';

import { Icon, Txt } from './kit';
import { color, radius, space } from './theme';

const STATUS_TONE: Record<EventStatus, [string, string]> = {
  DRAFT: [color.surface2, color.text2],
  PENDING_REVIEW: [color.warningSoft, color.warningText],
  APPROVED: [color.primarySoft, color.primary],
  PUBLISHED: [color.successSoft, color.success],
  REJECTED: [color.sosSoft, color.sosText],
  SUSPENDED: [color.sosSoft, color.sosText],
  CANCELLED: [color.surface2, color.text2],
  COMPLETED: [color.surface2, color.text2],
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const [bg, fg] = STATUS_TONE[status];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.full, paddingHorizontal: space.s, paddingVertical: 2 }}>
      <Txt v="caption" c={fg} style={{ fontWeight: '700' }}>{STATUS_LABEL[status]}</Txt>
    </View>
  );
}

function Meta({ icon, text }: { icon: Parameters<typeof Icon>[0]['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <Icon name={icon} size={16} tint={color.text2} />
      <Txt v="footnote" c={color.text2} numberOfLines={1} style={{ flexShrink: 1 }}>{text}</Txt>
    </View>
  );
}

export function Cover({ e, height = 150 }: { e: TmEvent; height?: number }) {
  const src = coverSource(e);
  return src ? (
    <Image source={src} style={{ width: '100%', height }} contentFit="cover" accessibilityIgnoresInvertColors />
  ) : (
    <View style={{ height, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={e.category.code === 'CYCLING' ? 'directions_bike' : e.category.code === 'CAMPING' ? 'camping' : 'landscape'} size={44} tint={color.primary} />
    </View>
  );
}

export function EventCard({ e, showStatus }: { e: TmEvent; showStatus?: boolean }) {
  const place = [e.start_location, e.destination].filter(Boolean).join(' → ');
  const duration = formatDuration(e.duration_minutes);
  const full = e.seats_available === 0;
  return (
    <Pressable onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
      accessibilityRole="button" accessibilityLabel={`${e.title}, ${e.category.label}, ${formatWhen(e.start_at)}, ${formatPrice(e.price_minor, e.currency)}`}
      style={({ pressed }) => ({ borderRadius: radius.l, overflow: 'hidden', borderWidth: 1, borderColor: color.border, backgroundColor: pressed ? color.surface : color.bg })}>
      <Cover e={e} />
      <View style={{ padding: space.l, gap: space.s }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, flexWrap: 'wrap' }}>
          <Txt v="caption" c={color.accentText} style={{ fontWeight: '700', textTransform: 'uppercase' }}>{e.category.label}</Txt>
          {e.difficulty ? <Txt v="caption" c={color.text2}>· {DIFFICULTY_LABEL[e.difficulty]}</Txt> : null}
          <View style={{ flex: 1 }} />
          {showStatus ? <StatusBadge status={e.status} /> : null}
        </View>
        <Txt v="headline" numberOfLines={2}>{e.title}</Txt>
        <Txt v="footnote" c={color.text2}>by {e.organizer.name}</Txt>
        {place ? <Meta icon="location_on" text={place} /> : null}
        <Meta icon="event" text={[formatWhen(e.start_at), duration].filter(Boolean).join(' · ')} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs }}>
          <Txt v="footnote" c={full ? color.sosText : color.success} style={{ fontWeight: '600' }}>{seatsText(e)}</Txt>
          <Txt v="headline" c={color.primary}>{formatPrice(e.price_minor, e.currency)}</Txt>
        </View>
      </View>
    </Pressable>
  );
}
