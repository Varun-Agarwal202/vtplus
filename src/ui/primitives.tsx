import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarHeightContext } from 'expo-router/tabs';
import React, { useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text as RNText,
  View,
  type AccessibilityRole,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Position } from '@/db/types';
import { guard } from '@/lib/feedback';
import { MAX_CONTENT_WIDTH, POSITION_MARK, radius, spacing, spring, useTheme, useTranslucentBars } from './theme';

/** The phone's own text size is honoured on top of the in-app size, up to this factor. */
const MAX_SYSTEM_TEXT_SCALE = 2;

/* ---------- press feedback ---------- */

/**
 * Press feedback that starts on touch-down and runs on the UI thread: a
 * critically damped spring toward `to`, back to 1 on release. Springs start
 * from the current value, so a quick re-press never jumps. Off with reduce
 * motion; the caller's pressed-state colour still gives instant feedback.
 */
export function usePressScale(to = 0.97) {
  const { reduceMotion } = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: (e?: GestureResponderEvent) => {
      void e;
      if (!reduceMotion) scale.set(withSpring(to, spring.press));
    },
    onPressOut: (e?: GestureResponderEvent) => {
      void e;
      scale.set(reduceMotion ? 1 : withSpring(1, spring.press));
    },
  };
}

/* ---------- layout ---------- */

export function Screen({
  children,
  scroll = true,
  padded = true,
  safeTop = false,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** the screen draws its own title (no navigation header), so pad for the status bar */
  safeTop?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // inside the tabs, content scrolls under the translucent tab bar and stops just above it
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const tabBar = useTranslucentBars() ? tabBarHeight : 0;
  const pad = padded ? { paddingHorizontal: spacing.md, paddingTop: safeTop ? insets.top + spacing.sm : spacing.sm } : { paddingTop: safeTop ? insets.top : 0 };
  const bottom = { paddingBottom: Math.max(tabBar, insets.bottom) + spacing.xl };
  if (!scroll) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.bg }]}>
        <View style={[styles.flex, styles.column, pad, bottom, style]}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.bg }, style]}
      contentContainerStyle={[styles.column, pad, bottom, contentStyle]}
      keyboardShouldPersistTaps="handled"
      scrollIndicatorInsets={tabBar ? { bottom: tabBar } : undefined}
      contentInsetAdjustmentBehavior={safeTop ? 'never' : 'automatic'}>
      {children}
    </ScrollView>
  );
}

/** A hairline rule. Decorative, so hidden from screen readers. */
export function Rule({ strong, style }: { strong?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors, highContrast } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[{ height: highContrast ? 1 : StyleSheet.hairlineWidth, backgroundColor: strong ? colors.hairlineStrong : colors.hairline }, style]}
    />
  );
}

/** A titled section; with `card`, the content sits on an inset panel. `index` is ignored, left over from an older layout. */
export function Panel({
  label,
  right,
  onSeeAll,
  seeAllLabel = 'See all',
  card,
  children,
  style,
}: {
  index?: string;
  label?: string;
  right?: React.ReactNode;
  /** a small "See all" link beside the heading */
  onSeeAll?: () => void;
  seeAllLabel?: string;
  /** `'list'` drops the vertical padding for panels made of rows */
  card?: boolean | 'list';
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ marginBottom: spacing.xl }, style]}>
      {label ? (
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, paddingHorizontal: card ? spacing.xs : 0, flexWrap: 'wrap' }}>
          <Text variant="heading" style={{ flexShrink: 1 }}>
            {label}
          </Text>
          {right ?? (onSeeAll ? <SeeAll label={seeAllLabel} onPress={onSeeAll} /> : null)}
        </Row>
      ) : null}
      {card ? <Box style={card === 'list' ? { paddingVertical: 0 } : undefined}>{children}</Box> : children}
    </View>
  );
}

/** The small link beside a section heading. */
function SeeAll({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, smallTarget } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={guard(onPress)}
      style={({ pressed }) => ({
        minHeight: smallTarget - 12,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.sm,
        marginRight: -spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: pressed ? colors.inset : 'transparent',
      })}>
      <Text variant="caption" color={colors.accent} style={{ fontWeight: '500' }}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={colors.accent} />
    </Pressable>
  );
}

/**
 * A round initial-letter badge that opens the profile. The initial stands in
 * for a photo we don't ask for; it is not a fake avatar.
 */
export function Avatar({ name, onPress, size = 40 }: { name: string | null; onPress: () => void; size?: number }) {
  const { colors, highContrast } = useTheme();
  const press = usePressScale(0.92);
  const initial = name?.trim().charAt(0).toUpperCase() ?? '';
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name ? `Profile, ${name}` : 'Profile'}
        hitSlop={8}
        onPress={guard(onPress)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: initial ? colors.ink : colors.surface,
          borderWidth: highContrast ? 2 : 0,
          borderColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {initial ? (
          <RNText maxFontSizeMultiplier={1.3} style={{ fontSize: size * 0.42, fontWeight: '600', color: colors.onInk }}>
            {initial}
          </RNText>
        ) : (
          <Ionicons name="person-outline" size={size * 0.5} color={colors.ink} />
        )}
      </Pressable>
    </Animated.View>
  );
}

/** An inset panel: quiet paper-like surface, continuous corners, no shadow. Outlined in high contrast. */
export function Box({ children, style, tone = 'plain', ...rest }: ViewProps & { tone?: 'plain' | 'signal' | 'accent' }) {
  const { colors, highContrast } = useTheme();
  const toned = tone !== 'plain';
  return (
    <View
      {...rest}
      style={[
        styles.box,
        {
          borderWidth: highContrast ? 2 : toned ? 1.5 : 0,
          borderColor: tone === 'signal' ? colors.signal : tone === 'accent' ? colors.accent : colors.hairlineStrong,
          backgroundColor: tone === 'signal' ? colors.signalSoft : tone === 'accent' ? colors.accentSoft : colors.surface,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/** A quick-action panel: icon above a short label. */
export function Tile({ icon, label, onPress, accessibilityHint }: { icon: React.ReactNode; label: string; onPress: () => void; accessibilityHint?: string }) {
  const { colors, highContrast, target } = useTheme();
  const press = usePressScale();
  return (
    <Animated.View style={[{ flex: 1 }, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        onPress={guard(onPress)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.box,
          {
            minHeight: target + 36,
            justifyContent: 'space-between',
            gap: spacing.sm,
            backgroundColor: pressed ? colors.inset : colors.surface,
            borderWidth: highContrast ? 2 : 0,
            borderColor: colors.hairlineStrong,
          },
        ]}>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {icon}
        </View>
        <Text variant="subheading">{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** A right-pointing chevron for navigation rows. Decorative. */
export function Chevron() {
  const { colors, textScale } = useTheme();
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ marginLeft: spacing.xs }}>
      <Ionicons name="chevron-forward" size={17 * Math.min(textScale, 1.5)} color={colors.hairlineStrong} />
    </View>
  );
}

export function Row({ children, style, gap = spacing.sm, ...rest }: ViewProps & { gap?: number }) {
  return (
    <View {...rest} style={[styles.row, { gap }, style]}>
      {children}
    </View>
  );
}

/** Two or more items side by side that stack vertically when text is large. */
export function ResponsiveRow({ children, gap = spacing.lg }: { children: React.ReactNode; gap?: number }) {
  const { textScale } = useTheme();
  return <View style={{ flexDirection: textScale >= 1.3 ? 'column' : 'row', gap }}>{children}</View>;
}

export function Spacer({ size = spacing.md }: { size?: number }) {
  return <View style={{ height: size }} />;
}

/* ---------- text ---------- */

type Variant = 'display' | 'title' | 'heading' | 'subheading' | 'body' | 'caption' | 'eyebrow' | 'mono' | 'monoSmall' | 'readout' | 'readoutLarge';

/**
 * The iOS type ramp. Leading tightens as size grows; tracking is negative on
 * large sizes, zero for body and slightly open on the smallest labels. On
 * iPhone, SF adds its own optical tracking on top, so these stay small.
 */
const variantStyle: Record<Variant, TextStyle> = {
  display: { fontSize: 34, lineHeight: 41, letterSpacing: -0.4, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: -0.2, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 25, letterSpacing: -0.2, fontWeight: '600' },
  subheading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 23 },
  caption: { fontSize: 15, lineHeight: 20 },
  eyebrow: { fontSize: 13, lineHeight: 18, letterSpacing: 0.1, fontWeight: '600' },
  mono: { fontSize: 17, lineHeight: 22, fontVariant: ['tabular-nums'], fontWeight: '500' },
  monoSmall: { fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  readout: { fontSize: 34, lineHeight: 40, letterSpacing: -0.6, fontVariant: ['tabular-nums'], fontWeight: '600' },
  readoutLarge: { fontSize: 64, lineHeight: 70, letterSpacing: -1.5, fontVariant: ['tabular-nums'], fontWeight: '600' },
};

const HEADER_VARIANTS: Variant[] = ['display', 'title', 'heading'];

/** Scale a style's size by the in-app text multiplier. */
export function scaled(style: TextStyle, scale: number): TextStyle {
  if (scale === 1) return style;
  return {
    ...style,
    fontSize: style.fontSize ? style.fontSize * scale : undefined,
    lineHeight: style.lineHeight ? style.lineHeight * scale : undefined,
  };
}

export function Text({
  variant = 'body',
  muted,
  faint,
  signal,
  color,
  style,
  accessibilityRole,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; faint?: boolean; signal?: boolean; color?: string }) {
  const { colors, textScale } = useTheme();
  const c = color ?? (signal ? colors.signal : faint ? colors.ink3 : muted ? colors.ink2 : colors.ink);
  const role: AccessibilityRole | undefined = accessibilityRole ?? (HEADER_VARIANTS.includes(variant) ? 'header' : undefined);
  return (
    <RNText
      maxFontSizeMultiplier={MAX_SYSTEM_TEXT_SCALE}
      accessibilityRole={role}
      {...rest}
      style={[scaled(variantStyle[variant], textScale), { color: c }, style]}
    />
  );
}

/* ---------- readouts ---------- */

/** A labelled reading: big tabular number, small unit, caption. Read as one sentence by screen readers. */
export function Readout({
  label,
  value,
  unit,
  unitSpoken,
  caption,
  size = 'md',
  style,
  align = 'left',
}: {
  label: string;
  value: string;
  unit?: string;
  /** how the unit should be read aloud, e.g. "times a second" for "/s" */
  unitSpoken?: string;
  caption?: string;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  align?: 'left' | 'center';
}) {
  const spoken = [`${label}: ${value}${unitSpoken ?? unit ? ` ${unitSpoken ?? unit}` : ''}`, caption].filter(Boolean).join('. ');
  return (
    <View accessible accessibilityLabel={spoken} style={[{ alignItems: align === 'center' ? 'center' : 'flex-start' }, style]}>
      <Text variant="eyebrow" faint>
        {label}
      </Text>
      <Row gap={spacing.xs} style={{ alignItems: 'baseline', marginTop: spacing.xs, flexWrap: 'wrap' }}>
        <Text variant={size === 'lg' ? 'readoutLarge' : 'readout'}>{value}</Text>
        {unit ? (
          <Text variant="mono" muted>
            {unit}
          </Text>
        ) : null}
      </Row>
      {caption ? (
        <Text variant="caption" muted style={{ marginTop: spacing.xs, textAlign: align }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** One line of a spec table. */
export function SpecRow({ k, v, last, hint }: { k: string; v: string; last?: boolean; hint?: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${k}: ${v}${hint ? `. ${hint}` : ''}`}
      style={{ paddingVertical: 12, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.hairline }}>
      <Row style={{ justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }}>
        <Text variant="caption" muted style={{ flex: 1, minWidth: 140 }}>
          {k}
        </Text>
        <Text variant="mono" style={{ textAlign: 'right', flexShrink: 1 }}>
          {v}
        </Text>
      </Row>
      {hint ? (
        <Text variant="caption" faint style={{ marginTop: 2 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A row of small stat tiles: label on top, number below. Stacks when text is large. */
export function SpecStrip({ items, style }: { items: { label: string; value: string; unit?: string }[]; style?: StyleProp<ViewStyle> }) {
  const { colors, textScale, highContrast } = useTheme();
  const stack = textScale >= 1.3;
  return (
    <View style={[{ flexDirection: stack ? 'column' : 'row', gap: spacing.sm }, style]}>
      {items.map((it) => (
        <View
          key={it.label}
          accessible
          accessibilityLabel={`${it.label}: ${it.value}${it.unit ? ` ${it.unit}` : ''}`}
          style={{
            flex: stack ? undefined : 1,
            padding: spacing.md,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.surface,
            borderWidth: highContrast ? 2 : 0,
            borderColor: colors.hairlineStrong,
          }}>
          <Text variant="caption" muted numberOfLines={1}>
            {it.label}
          </Text>
          <Row gap={spacing.xs} style={{ alignItems: 'baseline', marginTop: spacing.xs, flexWrap: 'wrap' }}>
            <Text variant="heading" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={stack ? undefined : 1}>
              {it.value}
            </Text>
            {it.unit ? (
              <Text variant="caption" muted>
                {it.unit}
              </Text>
            ) : null}
          </Row>
        </View>
      ))}
    </View>
  );
}

/* ---------- marks ---------- */

/** The single signal dot: live / active / attention. Decorative. */
export function Dot({ size = 8, color, style }: { size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? colors.signal }, style]}
    />
  );
}

/** Position marker glyph: ● rest, ■ postural, ◆ kinetic. Decorative: the position is always written next to it. */
export function PositionMark({ position, size = 10, color }: { position: Position; size?: number; color?: string }) {
  const { colors } = useTheme();
  const c = color ?? colors.ink;
  const shape = POSITION_MARK[position];
  const hidden = { importantForAccessibility: 'no' as const, accessibilityElementsHidden: true };
  if (shape === 'circle') return <View {...hidden} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c }} />;
  if (shape === 'square') return <View {...hidden} style={{ width: size, height: size, backgroundColor: c }} />;
  return <View {...hidden} style={{ width: size * 0.8, height: size * 0.8, backgroundColor: c, transform: [{ rotate: '45deg' }] }} />;
}

/* ---------- controls ---------- */

type ButtonVariant = 'primary' | 'signal' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  style,
  icon,
  size = 'md',
  onPress,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}: Omit<PressableProps, 'style'> & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
  size?: 'md' | 'lg' | 'sm';
}) {
  const { colors, target, smallTarget, textScale, highContrast } = useTheme();
  const press = usePressScale();
  const bg =
    variant === 'primary'
      ? colors.ink
      : variant === 'signal'
        ? colors.signal
        : variant === 'secondary'
          ? colors.inset
          : variant === 'danger'
            ? colors.signalSoft
            : 'transparent';
  const fg = variant === 'primary' ? colors.onInk : variant === 'signal' ? colors.onSignal : variant === 'danger' ? colors.signal : variant === 'secondary' ? colors.ink : colors.accent;
  const isDisabled = disabled || loading;
  const minHeight = size === 'lg' ? target + 4 : size === 'sm' ? smallTarget : target;
  const fontSize = (size === 'sm' ? 15 : 17) * textScale;
  return (
    <Animated.View style={[press.style, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
        disabled={isDisabled}
        hitSlop={6}
        onPress={guard(onPress)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...rest}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: pressed && variant === 'ghost' ? colors.inset : bg,
            borderColor: variant === 'danger' ? colors.signal : colors.hairlineStrong,
            borderWidth: highContrast && variant !== 'ghost' ? 2 : 0,
            minHeight,
            opacity: isDisabled ? 0.4 : 1,
          },
          variant === 'ghost' && { paddingHorizontal: spacing.sm },
        ]}>
        {loading ? (
          <ActivityIndicator color={fg} accessibilityLabel="Loading" />
        ) : (
          <Row gap={spacing.sm} style={{ alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            {icon}
            <RNText maxFontSizeMultiplier={MAX_SYSTEM_TEXT_SCALE} style={{ fontSize, fontWeight: '600', color: fg, textAlign: 'center' }}>
              {title}
            </RNText>
          </Row>
        )}
      </Pressable>
    </Animated.View>
  );
}

/**
 * A segmented control drawn as a row of pills: a grey track with an ink pill
 * that slides to the selection on a critically damped spring. A new tap
 * mid-slide retargets from where the pill is. With large text the options
 * stack and the pill becomes a static highlight.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string; hint?: string; spoken?: string }[];
  value: T;
  onChange: (v: T) => void;
  /** what the group chooses, e.g. "Position" */
  accessibilityLabel?: string;
}) {
  const { colors, smallTarget, textScale, highContrast, reduceMotion } = useTheme();
  const stack = textScale >= 1.5 && options.length > 2;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const [width, setWidth] = useState(0);
  const segW = width > 0 ? (width - 6) / options.length : 0;
  const x = useSharedValue(0);
  useEffect(() => {
    const to = index * segW;
    x.set(reduceMotion || segW === 0 ? to : withSpring(to, spring.move));
  }, [index, segW, reduceMotion, x]);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[
        styles.segmented,
        { backgroundColor: colors.inset, borderColor: colors.hairlineStrong, borderWidth: highContrast ? 2 : 0, flexDirection: stack ? 'column' : 'row' },
      ]}>
      {!stack && segW > 0 ? (
        <Animated.View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[
            styles.thumb,
            { width: segW, backgroundColor: colors.ink },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.spoken ?? o.label}
            accessibilityHint={o.hint}
            accessibilityState={{ checked: selected, selected }}
            onPress={guard(() => onChange(o.value))}
            style={[
              styles.segment,
              { minHeight: smallTarget - 4 },
              stack && selected && { backgroundColor: colors.ink, borderRadius: radius.pill },
            ]}>
            <RNText
              maxFontSizeMultiplier={MAX_SYSTEM_TEXT_SCALE}
              style={[styles.segmentText, { fontSize: 15 * textScale, color: selected ? colors.onInk : colors.ink, fontWeight: selected ? '600' : '500' }]}>
              {o.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { colors, smallTarget, textScale, highContrast } = useTheme();
  const press = usePressScale(0.96);
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ selected: !!selected, disabled: !onPress }}
        onPress={guard(onPress)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={!onPress}
        hitSlop={4}
        style={({ pressed }) => [
          styles.chip,
          {
            minHeight: smallTarget,
            minWidth: smallTarget,
            backgroundColor: selected ? colors.ink : pressed ? colors.hairline : colors.inset,
            borderColor: highContrast ? colors.ink : 'transparent',
            borderWidth: highContrast ? 2 : 0,
          },
        ]}>
        <RNText maxFontSizeMultiplier={MAX_SYSTEM_TEXT_SCALE} style={{ color: selected ? colors.onInk : colors.ink, fontSize: 15 * textScale, fontWeight: selected ? '600' : '500' }}>
          {label}
        </RNText>
      </Pressable>
    </Animated.View>
  );
}

/** A whole-row on/off switch: the entire row is the touch target, not just the little switch. */
export function ToggleRow({
  title,
  description,
  hint,
  value,
  onChange,
  last,
}: {
  title: string;
  description?: string;
  /** longer explanation for screen readers only */
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  const { colors, target } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={hint ?? description}
      accessibilityState={{ checked: value }}
      onPress={guard(() => onChange(!value))}
      style={{
        minHeight: target,
        paddingVertical: spacing.sm,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.hairline,
      }}>
      <Row style={{ alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text>{title}</Text>
          {description ? (
            <Text variant="caption" faint style={{ marginTop: 2 }}>
              {description}
            </Text>
          ) : null}
        </View>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none">
          <Switch value={value} trackColor={{ true: colors.accent, false: colors.inset }} ios_backgroundColor={colors.inset} />
        </View>
      </Row>
    </Pressable>
  );
}

/** Tap-to-expand section. The chevron turns on a spring; the content appears in place. */
export function Disclosure({
  title,
  subtitle,
  children,
  initiallyOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const { colors, target, highContrast, reduceMotion } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const turn = useSharedValue(initiallyOpen ? 1 : 0);
  useEffect(() => {
    turn.set(reduceMotion ? (open ? 1 : 0) : withSpring(open ? 1 : 0, spring.move));
  }, [open, reduceMotion, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
        accessibilityHint={open ? 'Double tap to collapse' : 'Double tap to expand'}
        accessibilityState={{ expanded: open }}
        onPress={guard(() => setOpen((o) => !o))}
        style={({ pressed }) => [
          styles.disclosure,
          { minHeight: target, backgroundColor: pressed ? colors.inset : colors.surface, borderColor: colors.hairlineStrong, borderWidth: highContrast ? 2 : 0 },
        ]}>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{title}</Text>
          {subtitle ? (
            <Text variant="caption" faint>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Animated.View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={chevron}>
          <Ionicons name="chevron-down" size={20} color={colors.ink3} />
        </Animated.View>
      </Pressable>
      {open ? <View style={{ paddingTop: spacing.md }}>{children}</View> : null}
    </View>
  );
}

/* ---------- feedback ---------- */

/**
 * A notice. `attention` notices carry the signal dot; `error` adds a signal
 * border and is announced as an alert. Nothing here is red/green: the app does
 * not moralise readings.
 */
export function Notice({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'attention' | 'error';
  title?: string;
  children?: React.ReactNode;
}) {
  const { colors, highContrast } = useTheme();
  const textOnly = typeof children === 'string' || children === undefined;
  return (
    <View
      accessible={textOnly}
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      accessibilityLabel={textOnly ? [kind === 'error' ? 'Problem' : kind === 'attention' ? 'Note' : null, title, children as string | undefined].filter(Boolean).join('. ') : undefined}
      style={[
        styles.notice,
        {
          borderColor: kind === 'error' ? colors.signal : colors.hairlineStrong,
          borderWidth: kind === 'error' ? 1.5 : highContrast ? 2 : 0,
          backgroundColor: colors.surface,
        },
      ]}>
      {title ? (
        <Row gap={spacing.sm} style={{ alignItems: 'center', marginBottom: children ? spacing.xs : 0 }}>
          {kind !== 'info' ? <Dot /> : null}
          <Text variant="subheading" style={{ flex: 1 }}>
            {title}
          </Text>
        </Row>
      ) : null}
      {typeof children === 'string' ? (
        <Text variant="caption" muted>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

/** A list row. Highlights the instant a finger lands, like a table cell. */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  last,
  accessibilityLabel,
  accessibilityHint,
}: {
  title: React.ReactNode;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const { colors, target } = useTheme();
  const label = accessibilityLabel ?? [typeof title === 'string' ? title : null, subtitle].filter(Boolean).join('. ');
  return (
    <Pressable
      onPress={guard(onPress)}
      disabled={!onPress}
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label || undefined}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.listRow,
        { minHeight: target, borderBottomColor: colors.hairline, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
        pressed && { backgroundColor: colors.inset, marginHorizontal: -spacing.md, paddingHorizontal: spacing.md },
      ]}>
      {left}
      <View style={{ flex: 1 }}>
        {typeof title === 'string' ? <Text>{title}</Text> : title}
        {subtitle ? (
          <Text variant="caption" faint style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  row: { flexDirection: 'row' },
  box: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing.md,
  },
  button: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: {
    borderRadius: radius.pill,
    padding: 3,
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: radius.pill,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { textAlign: 'center' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  notice: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing.md,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: spacing.md,
  },
});
