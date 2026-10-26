import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { AccessibilityInfo } from 'react-native';

import { getDevicePrefs, getSystemA11y } from '@/state/device-prefs';

/**
 * Non-visual feedback so people can measure without watching the screen:
 * spoken guidance, screen-reader announcements and vibration cues.
 */

export type HapticKind = 'tick' | 'start' | 'success' | 'warning';

export function haptic(kind: HapticKind): void {
  if (!getDevicePrefs().haptics) return;
  const run =
    kind === 'tick'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : kind === 'start'
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
        : kind === 'success'
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  run.catch(() => undefined);
}

/**
 * Say something to the user. With VoiceOver/TalkBack on, the screen reader
 * speaks it (so two voices never talk over each other); otherwise the app
 * speaks only when spoken guidance is turned on.
 */
export function announce(text: string, opts: { force?: boolean } = {}): void {
  if (!text) return;
  if (getSystemA11y().screenReader) {
    AccessibilityInfo.announceForAccessibility(text);
    return;
  }
  if (getDevicePrefs().voiceGuidance || opts.force) {
    Speech.stop();
    Speech.speak(text, { rate: 0.92, pitch: 1.0 });
  }
}

export function stopSpeaking(): void {
  Speech.stop();
}

/** Ignores a second tap that lands soon after the first, when the tap guard is on. */
let lastAccepted = 0;
export const TAP_GUARD_MS = 700;

export function acceptPress(now = Date.now()): boolean {
  if (!getDevicePrefs().tapGuard) return true;
  if (now - lastAccepted < TAP_GUARD_MS) return false;
  lastAccepted = now;
  return true;
}

export function guard<A extends unknown[]>(fn: ((...args: A) => void) | undefined | null): ((...args: A) => void) | undefined {
  if (!fn) return undefined;
  return (...args: A) => {
    if (acceptPress()) fn(...args);
  };
}
