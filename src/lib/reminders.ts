import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let mod: NotificationsModule | null | undefined;

/** Loaded lazily: the module logs warnings at import time in Expo Go on Android. */
function notifications(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web') return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
  } catch {
    mod = null;
  }
  return mod;
}

const REMINDER_ID = 'daily-measure-reminder';

export function formatHour(h: number): string {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Schedule (or clear, with `null`) one daily local notification.
 * Returns an error message for the UI, or null on success.
 */
export async function setDailyReminder(hour: number | null): Promise<string | null> {
  const N = notifications();
  if (!N) return 'Reminders aren’t available on this device.';
  try {
    await N.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
    if (hour === null) return null;
    const perm = await N.getPermissionsAsync();
    let granted = perm.granted;
    if (!granted && perm.canAskAgain) granted = (await N.requestPermissionsAsync()).granted;
    if (!granted) return 'Notifications are turned off for this app. You can allow them in your phone’s Settings.';
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: N.AndroidImportance.DEFAULT });
    }
    await N.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: 'Time for your tremor check',
        body: 'A 30-second reading at the same time each day makes your trends clearer.',
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DAILY, hour, minute: 0, channelId: 'reminders' },
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not set the reminder.';
  }
}
