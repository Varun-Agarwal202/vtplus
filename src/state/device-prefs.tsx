import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Preferences that belong to the phone, not the account: display and
 * accessibility settings have to work on the sign-in screen too, and a shared
 * family phone may want different ones from the person's other devices.
 */

export type ThemeMode = 'system' | 'light' | 'dark';
export type TextSize = 'default' | 'large' | 'larger' | 'largest';

export interface DevicePrefs {
  themeMode: ThemeMode;
  highContrast: boolean;
  textSize: TextSize;
  /** taller buttons, chips and rows */
  largeTargets: boolean;
  /** ignore a second tap that lands right after the first (tremor double-taps) */
  tapGuard: boolean;
  /** read countdowns, instructions and results out loud */
  voiceGuidance: boolean;
  haptics: boolean;
  /** turn off moving waveforms and animated transitions */
  reduceMotion: boolean;
  /** local hour (0–23) for a daily "time to measure" reminder, or null */
  reminderHour: number | null;
}

export const DEFAULT_DEVICE_PREFS: DevicePrefs = {
  themeMode: 'system',
  highContrast: false,
  textSize: 'default',
  largeTargets: false,
  tapGuard: false,
  voiceGuidance: false,
  haptics: true,
  reduceMotion: false,
  reminderHour: null,
};

export const TEXT_SCALE: Record<TextSize, number> = {
  default: 1,
  large: 1.15,
  larger: 1.3,
  largest: 1.5,
};

export interface SystemA11y {
  screenReader: boolean;
  reduceMotion: boolean;
  boldText: boolean;
  /** iOS Reduce Transparency: translucent bars go solid */
  reduceTransparency: boolean;
}

const STORAGE_KEY = 'tremor.devicePrefs.v1';

function parse(raw: string | null): DevicePrefs {
  if (!raw) return { ...DEFAULT_DEVICE_PREFS };
  try {
    const v = JSON.parse(raw) as Partial<DevicePrefs>;
    const out: DevicePrefs = { ...DEFAULT_DEVICE_PREFS };
    if (v.themeMode === 'system' || v.themeMode === 'light' || v.themeMode === 'dark') out.themeMode = v.themeMode;
    if (v.textSize && v.textSize in TEXT_SCALE) out.textSize = v.textSize;
    for (const k of ['highContrast', 'largeTargets', 'tapGuard', 'voiceGuidance', 'haptics', 'reduceMotion'] as const) {
      if (typeof v[k] === 'boolean') out[k] = v[k];
    }
    if (v.reminderHour === null || (typeof v.reminderHour === 'number' && v.reminderHour >= 0 && v.reminderHour <= 23)) {
      out.reminderHour = v.reminderHour ?? null;
    }
    return out;
  } catch {
    return { ...DEFAULT_DEVICE_PREFS };
  }
}

async function read(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  return SecureStore.getItemAsync(STORAGE_KEY);
}

async function write(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, value);
}

/** Latest prefs for non-React helpers (speech, haptics, tap guard). */
let current: DevicePrefs = { ...DEFAULT_DEVICE_PREFS };
let currentSystem: SystemA11y = { screenReader: false, reduceMotion: false, boldText: false, reduceTransparency: false };
export const getDevicePrefs = () => current;
export const getSystemA11y = () => currentSystem;

interface DevicePrefsValue {
  prefs: DevicePrefs;
  system: SystemA11y;
  loaded: boolean;
  set: <K extends keyof DevicePrefs>(key: K, value: DevicePrefs[K]) => void;
  reset: () => void;
  /** combined in-app text multiplier */
  textScale: number;
  /** the user's choice or the phone's system setting */
  reduceMotion: boolean;
}

const DevicePrefsContext = createContext<DevicePrefsValue | null>(null);

export function DevicePrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<DevicePrefs>(DEFAULT_DEVICE_PREFS);
  const [system, setSystem] = useState<SystemA11y>(currentSystem);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    read()
      .then((raw) => {
        if (!alive) return;
        const p = parse(raw);
        current = p;
        setPrefs(p);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const update = (patch: Partial<SystemA11y>) =>
      setSystem((s) => {
        const next = { ...s, ...patch };
        currentSystem = next;
        return next;
      });
    AccessibilityInfo.isScreenReaderEnabled().then((v) => update({ screenReader: v })).catch(() => undefined);
    AccessibilityInfo.isReduceMotionEnabled().then((v) => update({ reduceMotion: v })).catch(() => undefined);
    if (Platform.OS === 'ios') {
      AccessibilityInfo.isBoldTextEnabled().then((v) => update({ boldText: v })).catch(() => undefined);
      AccessibilityInfo.isReduceTransparencyEnabled().then((v) => update({ reduceTransparency: v })).catch(() => undefined);
    }
    const subs = [
      AccessibilityInfo.addEventListener('screenReaderChanged', (v) => update({ screenReader: v })),
      AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => update({ reduceMotion: v })),
      ...(Platform.OS === 'ios'
        ? [
            AccessibilityInfo.addEventListener('boldTextChanged', (v) => update({ boldText: v })),
            AccessibilityInfo.addEventListener('reduceTransparencyChanged', (v) => update({ reduceTransparency: v })),
          ]
        : []),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  const set = useCallback(<K extends keyof DevicePrefs>(key: K, value: DevicePrefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      current = next;
      write(JSON.stringify(next)).catch((e) => console.warn('prefs save failed', e));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = { ...DEFAULT_DEVICE_PREFS, reminderHour: current.reminderHour };
    current = next;
    setPrefs(next);
    write(JSON.stringify(next)).catch(() => undefined);
  }, []);

  const value = useMemo<DevicePrefsValue>(
    () => ({
      prefs,
      system,
      loaded,
      set,
      reset,
      textScale: TEXT_SCALE[prefs.textSize],
      reduceMotion: prefs.reduceMotion || system.reduceMotion,
    }),
    [prefs, system, loaded, set, reset],
  );

  return <DevicePrefsContext.Provider value={value}>{children}</DevicePrefsContext.Provider>;
}

export function useDevicePrefs(): DevicePrefsValue {
  const ctx = useContext(DevicePrefsContext);
  if (!ctx) throw new Error('useDevicePrefs must be used inside DevicePrefsProvider');
  return ctx;
}

/** For shared UI that may render outside the provider (tests, error screens). */
export function useDevicePrefsOptional(): DevicePrefsValue | null {
  return useContext(DevicePrefsContext);
}
