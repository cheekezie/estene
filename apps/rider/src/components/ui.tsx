import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '@estene/theme/tokens';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** A scrolling page with safe-area padding. */
export function Screen({
  children,
  scroll = true,
  ...rest
}: ScrollViewProps & { scroll?: boolean; children: React.ReactNode }) {
  return (
    <SafeAreaView style={s.screen} edges={['left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={s.screenContent}
          keyboardShouldPersistTaps="handled"
          {...rest}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[s.screenContent, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  return <View style={[s.card, style]} {...rest} />;
}

type Tone = 'default' | 'muted' | 'primary' | 'danger' | 'success';
const toneColor: Record<Tone, string> = {
  default: colors.foreground,
  muted: colors.mutedForeground,
  primary: colors.primary,
  danger: colors.destructive,
  success: colors.success,
};

export function T({
  size = 16,
  weight = '400',
  tone = 'default',
  style,
  ...rest
}: TextProps & {
  size?: number;
  weight?: '400' | '500' | '600' | '700' | '800';
  tone?: Tone;
}) {
  return (
    <Text
      style={[
        { fontSize: size, fontWeight: weight, color: toneColor[tone], lineHeight: size * 1.35 },
        style,
      ]}
      {...rest}
    />
  );
}

export const Label = (p: TextProps) => (
  <T size={13} weight="600" tone="muted" style={s.label} {...p} />
);

type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';

export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  ...rest
}: PressableProps & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewProps['style'];
}) {
  const v = variants[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && !off && { opacity: 0.85 },
        off && { opacity: 0.5 },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={s.buttonInner}>
          {icon}
          <Text style={[s.buttonText, { color: v.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const variants: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary },
  accent: { bg: colors.accent, fg: colors.accentForeground, border: colors.accent },
  outline: { bg: colors.card, fg: colors.primary, border: colors.input },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.card, fg: colors.destructive, border: colors.destructive },
};

export function Field({
  label,
  error,
  hint,
  style,
  ...rest
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        style={[s.input, error ? { borderColor: colors.destructive } : null, style]}
        {...rest}
      />
      {error ? (
        <T size={13} tone="danger">
          {error}
        </T>
      ) : hint ? (
        <T size={13} tone="muted">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Notice({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const c = {
    info: [colors.infoSoft, colors.info],
    warning: [colors.warningSoft, colors.warning],
    error: [colors.destructiveSoft, colors.destructive],
    success: [colors.successSoft, colors.success],
  }[tone];
  return (
    <View style={[s.notice, { backgroundColor: c[0], borderColor: c[1] }]}>
      <Text style={{ color: c[1], fontSize: 15, lineHeight: 21, fontWeight: '500' }}>
        {children}
      </Text>
      {action}
    </View>
  );
}

/** Pill-style choice chips (parcel sizes, failure reasons). */
export function Chips<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V | null;
  onChange: (v: V) => void;
}) {
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[s.chip, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          >
            <Text
              style={{
                color: on ? colors.primaryForeground : colors.foreground,
                fontWeight: '600',
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const Divider = () => <View style={s.divider} />;

export const Row = ({ style, ...rest }: ViewProps) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm }, style]} {...rest} />
);

export function Loading() {
  return (
    <View style={{ padding: space.xl, alignItems: 'center' }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: space.lg, gap: space.lg, paddingBottom: 48 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
  button: {
    minHeight: 54,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonText: { fontSize: 17, fontWeight: '700' },
  input: {
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: colors.input,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    fontSize: 18,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  notice: { borderRadius: radius.lg, borderWidth: 1, padding: space.md, gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 46,
    paddingHorizontal: space.lg,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.input,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: colors.border },
});
