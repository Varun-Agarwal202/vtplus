import { Platform, useColorScheme } from 'react-native';

import type { Position } from '@/db/types';
import { DEFAULT_DEVICE_PREFS, TEXT_SCALE, useDevicePrefsOptional } from '@/state/device-prefs';

/**
 * Instrument: a warm, low-stimulation field for an action that can already
 * feel demanding. Deep teal carries deliberate actions; rust is reserved for
 * the live recording state and attention. Every text colour is chosen to
 * retain a WCAG AA relationship with its intended background.
 */

const light = {
  bg: '#F7F5F0',
  surface: '#FFFDF8',
  inset: '#E9E5DC',
  hairline: '#D6D1C7',
  hairlineStrong: '#777269',
  ink: '#20201D',
  ink2: '#48463F',
  ink3: '#6A675F',
  /** text on an ink-filled pill: primary buttons, selected chips */
  onInk: '#FFFFFF',
  /** actions, selected states */
  accent: '#0B625D',
  accentSoft: '#DDEDEA',
  onAccent: '#FFFFFF',
  /** record key, live marks, warnings */
  signal: '#B54120',
  signalSoft: '#F7E4DC',
  onSignal: '#FFFFFF',
  /** keyboard / switch-control focus ring */
  focus: '#0B625D',
  chart: {
    grid: '#E9E5DC',
    band: 'rgba(11,98,93,0.10)',
    line: '#20201D',
    prev: '#AAA49A',
  },
};

export type ThemeColors = typeof light;

const dark: ThemeColors = {
  bg: '#151714',
  surface: '#1D201B',
  inset: '#30342D',
  hairline: '#3E433B',
  hairlineStrong: '#A8AEA0',
  ink: '#F6F3EB',
  ink2: '#DEDCD3',
  ink3: '#B7B7AB',
  onInk: '#151714',
  accent: '#77C7BC',
  accentSoft: '#173B37',
  onAccent: '#082B27',
  signal: '#FF9B76',
  signalSoft: '#482519',
  onSignal: '#301107',
  focus: '#77C7BC',
  chart: {
    grid: '#30342D',
    band: 'rgba(119,199,188,0.16)',
    line: '#F6F3EB',
    prev: '#787D75',
  },
};

const lightHighContrast: ThemeColors = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  inset: '#E7E5DF',
  hairline: '#595751',
  hairlineStrong: '#000000',
  ink: '#171715',
  ink2: '#2C2B27',
  ink3: '#403E38',
  onInk: '#FFFFFF',
  accent: '#005A55',
  accentSoft: '#D5E8E4',
  onAccent: '#FFFFFF',
  signal: '#92300F',
  signalSoft: '#F5DFD6',
  onSignal: '#FFFFFF',
  focus: '#005A55',
  chart: {
    grid: '#87847B',
    band: 'rgba(0,90,85,0.14)',
    line: '#171715',
    prev: '#56534C',
  },
};

const darkHighContrast: ThemeColors = {
  bg: '#000000',
  surface: '#0A0B09',
  inset: '#20231E',
  hairline: '#A9ADA3',
  hairlineStrong: '#FFFFFF',
  ink: '#FFFFFF',
  ink2: '#F0F0EA',
  ink3: '#D8D8CE',
  onInk: '#000000',
  accent: '#82D8CC',
  accentSoft: '#123D38',
  onAccent: '#001F1C',
  signal: '#FFAB88',
  signalSoft: '#4A2417',
  onSignal: '#2A0A02',
  focus: '#FFFFFF',
  chart: {
    grid: '#868B81',
    band: 'rgba(130,216,204,0.20)',
    line: '#FFFFFF',
    prev: '#BEC2B8',
  },
};

/** Positions are told apart by their label and marker shape, never colour alone. */
export const POSITION_MARK: Record<Position, 'circle' | 'square' | 'diamond'> = {
  rest: 'circle',
  postural: 'square',
  kinetic: 'diamond',
};

/**
 * The system font (SF Pro on iPhone, Roboto on Android). It ships optical
 * sizing and Dynamic Type, so weight comes from `fontWeight`; these stay
 * undefined so older call sites fall through to it.
 */
export const font = {
  sans: undefined,
  sansMedium: undefined,
  sansSemi: undefined,
  mono: undefined,
  monoRegular: undefined,
} as const satisfies Record<string, string | undefined>;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Used with `borderCurve: 'continuous'` for Apple's squircle corners. Panels
 * are generously rounded (20) and buttons are full pills, so the grouped
 * background reads as a stack of soft cards rather than a settings table.
 */
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

/** Content never stretches wider than this on tablets. */
export const MAX_CONTENT_WIDTH = 640;

/**
 * Springs, after Apple's damping-ratio + response model. Critically damped
 * (no overshoot) by default; a little bounce only after a flick.
 */
export const spring = {
  press: { dampingRatio: 1, duration: 220 },
  move: { dampingRatio: 1, duration: 380 },
  flick: { dampingRatio: 0.8, duration: 380 },
} as const;

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
  highContrast: boolean;
  /** in-app text multiplier on top of the phone's own text size */
  textScale: number;
  /** minimum height for buttons and other primary touch targets */
  target: number;
  /** minimum height for chips, segments and secondary controls */
  smallTarget: number;
  largeTargets: boolean;
  reduceMotion: boolean;
  /** phone-level bold text (iOS) */
  boldText: boolean;
  /** solid bars instead of translucent ones (iOS setting, or high contrast) */
  reduceTransparency: boolean;
}

/** Whether bars use a translucent material (and float over content) rather than a solid fill. */
export function useTranslucentBars(): boolean {
  const { reduceTransparency } = useTheme();
  return Platform.OS === 'ios' && !reduceTransparency;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const ctx = useDevicePrefsOptional();
  const prefs = ctx?.prefs ?? DEFAULT_DEVICE_PREFS;
  const isDark = prefs.themeMode === 'system' ? scheme === 'dark' : prefs.themeMode === 'dark';
  const hc = prefs.highContrast;
  const colors = isDark ? (hc ? darkHighContrast : dark) : hc ? lightHighContrast : light;
  return {
    colors,
    isDark,
    highContrast: hc,
    textScale: ctx?.textScale ?? TEXT_SCALE[prefs.textSize],
    target: prefs.largeTargets ? 64 : 52,
    smallTarget: prefs.largeTargets ? 56 : 46,
    largeTargets: prefs.largeTargets,
    reduceMotion: ctx?.reduceMotion ?? false,
    boldText: ctx?.system.boldText ?? false,
    reduceTransparency: hc || (ctx?.system.reduceTransparency ?? false),
  };
}
