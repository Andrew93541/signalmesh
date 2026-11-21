// Reusable TrackMate UI components (DESIGN_SYSTEM.md § 5).

import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, shadow1, space, type, type TypeStyle } from './theme';

// ---- icon -------------------------------------------------------------------

/** Material Symbol on Android, closest SF Symbol on iOS. */
export function Icon({ name, sf, size = 24, tint = color.text }: { name: AndroidSymbol; sf?: SFSymbol; size?: number; tint?: string }) {
  return (
    <SymbolView
      name={{ android: name, ios: sf ?? 'circle', web: name as never }}
      size={size}
      tintColor={tint}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

// ---- text -------------------------------------------------------------------

export function Txt({ children, v = 'body', c = color.text, center, style, numberOfLines }: {
  children: ReactNode; v?: TypeStyle; c?: string; center?: boolean; style?: TextStyle; numberOfLines?: number;
}) {
  return (
    <Text numberOfLines={numberOfLines} style={[type[v] as TextStyle, { color: c }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

// ---- layout -----------------------------------------------------------------

/** Scrollable screen. `tab` adds the top safe-area inset (tab screens have no header). */
export function Screen({ children, tab, bg = color.bg }: { children: ReactNode; tab?: boolean; bg?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{
        paddingHorizontal: space.l,
        paddingTop: (tab ? insets.top : 0) + space.l,
        paddingBottom: insets.bottom + space.x5 + 40,
        gap: space.xxl,
      }}>
      {children}
    </ScrollView>
  );
}

export function Section({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ gap: space.m }}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt v="title2" style={{ flex: 1 }}>{title}</Txt>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Card({ children, onPress, tone = 'plain', style, label }: {
  children: ReactNode; onPress?: () => void; tone?: 'plain' | 'surface' | 'primary' | 'success' | 'warning' | 'critical'; style?: ViewStyle; label?: string;
}) {
  const tones = {
    plain: { backgroundColor: color.bg, borderColor: color.border },
    surface: { backgroundColor: color.surface, borderColor: color.surface },
    primary: { backgroundColor: color.primarySoft, borderColor: color.primarySoft },
    success: { backgroundColor: color.successSoft, borderColor: color.successSoft },
    warning: { backgroundColor: color.warningSoft, borderColor: color.warningSoft },
    critical: { backgroundColor: color.sosSoft, borderColor: color.sosSoft },
  } as const;
  const base = [s.card, tones[tone], tone === 'plain' && shadow1, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [...base, pressed && { backgroundColor: color.surface2 }]}>
      {children}
    </Pressable>
  );
}

// ---- controls ---------------------------------------------------------------

export function Button({ label, onPress, kind = 'primary', icon, disabled, loading, compact }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'tertiary' | 'destructive';
  icon?: AndroidSymbol; disabled?: boolean; loading?: boolean; compact?: boolean;
}) {
  const fg = kind === 'primary' ? color.onPrimary : kind === 'destructive' ? color.sosText : color.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => [
        s.button,
        compact && { height: 44, paddingHorizontal: space.l },
        kind === 'primary' && { backgroundColor: pressed ? color.primaryPressed : color.primary },
        kind === 'secondary' && { borderWidth: 1, borderColor: color.borderStrong, backgroundColor: pressed ? color.surface2 : color.bg },
        kind === 'tertiary' && { backgroundColor: pressed ? color.surface2 : 'transparent' },
        kind === 'destructive' && { borderWidth: 1, borderColor: color.sosText, backgroundColor: pressed ? color.sosSoft : color.bg },
        (disabled || loading) && { opacity: 0.5 },
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={20} tint={fg} /> : null}
      <Txt v="headline" c={fg}>{label}</Txt>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: AndroidSymbol }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[s.chip, selected ? { backgroundColor: color.primarySoft, borderColor: color.primary } : { borderColor: color.borderStrong }]}>
      {icon ? <Icon name={icon} size={18} tint={selected ? color.primary : color.text2} /> : null}
      <Txt v="callout" c={selected ? color.primary : color.text} style={{ fontWeight: '600' }}>{label}</Txt>
    </Pressable>
  );
}

export function Row({ icon, title, subtitle, onPress, right, danger }: {
  icon?: AndroidSymbol; title: string; subtitle?: string; onPress?: () => void; right?: ReactNode; danger?: boolean;
}) {
  const content = (
    <>
      {icon ? (
        <View style={[s.rowIcon, danger && { backgroundColor: color.sosSoft }]}>
          <Icon name={icon} size={22} tint={danger ? color.sosText : color.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="headline" c={danger ? color.sosText : color.text}>{title}</Txt>
        {subtitle ? <Txt v="footnote" c={color.text2}>{subtitle}</Txt> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron_right" sf="chevron.right" size={22} tint={color.text3} /> : null)}
    </>
  );
  if (!onPress) return <View style={s.row}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [s.row, pressed && { backgroundColor: color.surface2 }]}>
      {content}
    </Pressable>
  );
}

/** Info / warning / critical banner. Icon + words, never colour alone. */
export function Banner({ tone, icon, title, body }: {
  tone: 'info' | 'warning' | 'critical' | 'success'; icon: AndroidSymbol; title: string; body?: string;
}) {
  const t = {
    info: [color.primarySoft, color.primary],
    warning: [color.warningSoft, color.warningText],
    critical: [color.sosSoft, color.sosText],
    success: [color.successSoft, color.success],
  }[tone];
  return (
    <View style={[s.banner, { backgroundColor: t[0] }]} accessibilityRole="alert">
      <Icon name={icon} size={22} tint={t[1]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="headline" c={t[1]}>{title}</Txt>
        {body ? <Txt v="footnote" c={color.text}>{body}</Txt> : null}
      </View>
    </View>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={s.stat} accessible accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}>
      <Txt v="stat">{value}</Txt>
      <Txt v="footnote" c={color.text2}>{label}</Txt>
      {hint ? <Txt v="caption" c={color.text3}>{hint}</Txt> : null}
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: AndroidSymbol; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: space.m, paddingVertical: space.x3 }}>
      <View style={[s.rowIcon, { width: 56, height: 56, borderRadius: 28 }]}><Icon name={icon} size={28} tint={color.primary} /></View>
      <Txt v="headline" center>{title}</Txt>
      <Txt v="callout" c={color.text2} center>{body}</Txt>
      {action}
    </View>
  );
}

/**
 * Text field that commits its value when editing ends in any way (blur, Enter,
 * end-editing). Some Android keyboards close on Back without onEndEditing.
 */
export function SettingField({ label, hint, value, onSave, numeric, placeholder }: {
  label: string; hint?: string; value: string; onSave: (v: string) => void; numeric?: boolean; placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const commit = () => { if (draft.trim() !== value) onSave(draft.trim()); };
  return (
    <View style={{ gap: space.xs }}>
      <Txt v="headline">{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={draft}
        onChangeText={setDraft}
        onEndEditing={commit}
        onBlur={commit}
        onSubmitEditing={commit}
        returnKeyType="done"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={numeric ? 'number-pad' : 'default'}
        placeholder={placeholder}
        placeholderTextColor={color.text3}
      />
      {hint ? <Txt v="footnote" c={color.text2}>{hint}</Txt> : null}
    </View>
  );
}

export function SwitchRow({ title, subtitle, value, onChange }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[s.row, { paddingHorizontal: 0 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="headline">{title}</Txt>
        {subtitle ? <Txt v="footnote" c={color.text2}>{subtitle}</Txt> : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: color.primary, false: color.borderStrong }}
        thumbColor={color.bg}
      />
    </View>
  );
}

export const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.m, padding: space.l, gap: space.s },
  button: { height: 52, borderRadius: radius.m, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s, paddingHorizontal: space.xl },
  chip: { minHeight: 44, paddingHorizontal: space.l, borderRadius: radius.full, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, paddingHorizontal: space.xs, borderRadius: radius.s },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', gap: space.m, padding: space.l, borderRadius: radius.m, alignItems: 'flex-start' },
  stat: { flex: 1, backgroundColor: color.surface, borderRadius: radius.m, padding: space.l, gap: 2 },
  input: { minHeight: 52, borderWidth: 1, borderColor: color.borderStrong, borderRadius: radius.s, paddingHorizontal: space.l, fontSize: 16, color: color.text, backgroundColor: color.bg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
});
