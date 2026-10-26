import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';

import { useRepository, type SyncInfo } from '@/data/repository-context';
import { DURATION_OPTIONS, type Units } from '@/db/settings';
import { useAuth } from '@/state/auth-context';
import { POSITION_LABEL, POSITIONS } from '@/db/types';
import type { AnalysisMode } from '@/dsp/types';
import { sessionsCsv } from '@/export/csv';
import { deleteAllRawRecordings, shareText } from '@/export/files';
import { DISCLAIMER_SENTENCE } from '@/export/summary';
import { announce } from '@/lib/feedback';
import { disableMfa } from '@/lib/mfa';
import { CONDITION_LABEL } from '@/lib/profile';
import { formatHour, setDailyReminder } from '@/lib/reminders';
import { useDevicePrefs } from '@/state/device-prefs';
import { useSettings } from '@/state/settings-context';
import { Box, Chevron, Disclosure, ListRow, Panel, Screen, Segmented, Spacer, Text, ToggleRow } from '@/ui/primitives';
import { spacing, useTheme } from '@/ui/theme';

const REMINDER_HOURS = [8, 12, 18, 21];

export default function SettingsScreen() {
  const { settings, set, reload } = useSettings();
  const { prefs, set: setPref } = useDevicePrefs();
  const { colors } = useTheme();
  const [reminderError, setReminderError] = useState<string | null>(null);

  const chooseReminder = async (v: string) => {
    const hour = v === 'off' ? null : Number(v);
    const err = await setDailyReminder(hour);
    setReminderError(err);
    if (!err) setPref('reminderHour', hour);
  };
  const repo = useRepository();
  const { user, signOut, mfaEnabled, refreshMfa } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);

  const refreshSync = useCallback(async () => {
    try {
      setSyncInfo(await repo.getSyncInfo());
    } catch {
      setSyncInfo(null);
    }
  }, [repo]);

  useFocusEffect(
    useCallback(() => {
      void refreshSync();
      void refreshMfa();
    }, [refreshSync, refreshMfa]),
  );

  const toggleMfa = (on: boolean) => {
    if (on) {
      router.push('/two-factor');
      return;
    }
    Alert.alert('Turn off two-step sign-in?', 'You’ll only need your password (or Google) the next time you sign in.', [
      { text: 'Keep it on', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: async () => {
          const { error } = await disableMfa();
          if (error) {
            Alert.alert('Couldn’t turn it off', error);
            return;
          }
          announce('Two-step sign-in is off');
          await refreshMfa();
        },
      },
    ]);
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await repo.syncNow();
      await refreshSync();
    } catch (e) {
      Alert.alert('Could not sync', e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const all = await repo.listSessions({ analysisMode: 'all' });
      if (all.length === 0) {
        Alert.alert('Nothing to export', 'No sessions have been saved yet.');
        return;
      }
      await shareText(`tremor_sessions_${new Date().toISOString().slice(0, 10)}.csv`, sessionsCsv(all, settings.units), 'text/csv', 'Export all sessions');
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const deleteAll = () => {
    Alert.alert('Delete all data?', 'Every saved session in your account and raw recordings on this phone will be removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete everything',
        style: 'destructive',
        onPress: async () => {
          try {
            await repo.deleteAllSessions();
            deleteAllRawRecordings();
            await repo.clearSettings();
            await set('disclaimerAccepted', true);
            await reload();
            Alert.alert('Done', 'All data has been deleted.');
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <Screen safeTop>
      <Text variant="display" style={{ marginTop: spacing.sm }}>
        Settings
      </Text>
      <Spacer size={spacing.lg} />

      <Panel card="list">
        <ListRow
          left={<Ionicons name="person-circle-outline" size={24} color={colors.accent} />}
          title="Profile"
          subtitle={settings.profile.onboarded ? [settings.profile.name, settings.profile.condition ? CONDITION_LABEL[settings.profile.condition] : null].filter(Boolean).join(' · ') || 'Edit' : 'Not set'}
          accessibilityHint="Name, diagnosis, difficult tasks and triggers. Used to tailor suggestions."
          right={<Chevron />}
          onPress={() => router.push('/profile')}
        />
        <ListRow
          left={<Ionicons name="accessibility-outline" size={24} color={colors.accent} />}
          title="Accessibility & display"
          subtitle="Text size, appearance, touch"
          accessibilityHint="Text size, light or dark mode, bigger buttons, spoken instructions and more"
          right={<Chevron />}
          onPress={() => router.push('/accessibility')}
          last
        />
      </Panel>

      <Panel label="Daily reminder" card>
        <Segmented<string>
          accessibilityLabel="Daily reminder time"
          options={[{ value: 'off', label: 'Off' }, ...REMINDER_HOURS.map((h) => ({ value: String(h), label: formatHour(h) }))]}
          value={prefs.reminderHour === null ? 'off' : String(prefs.reminderHour)}
          onChange={(v) => void chooseReminder(v)}
        />
        {reminderError ? (
          <Text variant="caption" signal style={{ marginTop: spacing.sm }} accessibilityRole="alert">
            {reminderError}
          </Text>
        ) : null}
      </Panel>

      <Panel label="Recording" card>
        <Field label="Length">
          <Segmented<string>
            accessibilityLabel="Recording length"
            options={DURATION_OPTIONS.map((d) => ({ value: String(d), label: `${d}s` }))}
            value={String(settings.durationS)}
            onChange={(v) => set('durationS', Number(v))}
          />
        </Field>
        <Field label="Default position" last>
          <Segmented
            accessibilityLabel="Default position"
            options={POSITIONS.map((p) => ({ value: p, label: POSITION_LABEL[p] }))}
            value={settings.defaultPosition}
            onChange={(v) => set('defaultPosition', v)}
          />
        </Field>
      </Panel>

      <Panel label="Account" card="list">
        <ListRow title={user?.email ?? 'Signed in'} subtitle={syncInfo?.pendingCount ? `${syncInfo.pendingCount} change${syncInfo.pendingCount === 1 ? '' : 's'} waiting to upload` : 'Synced'} />
        <ToggleRow
          title="Two-step sign-in"
          description={mfaEnabled ? 'A code from your authenticator is needed each time you sign in.' : 'Ask for a code from an authenticator app after your password.'}
          hint={mfaEnabled ? 'Turns off two-step sign-in.' : 'Opens setup for two-step sign-in.'}
          value={mfaEnabled}
          onChange={toggleMfa}
        />
        <ListRow title={<Text color={colors.accent}>{syncing ? 'Syncing…' : 'Sync now'}</Text>} accessibilityLabel="Sync now" onPress={syncing ? undefined : syncNow} />
        <ListRow title={<Text color={colors.accent}>{exporting ? 'Exporting…' : 'Export all (CSV)'}</Text>} accessibilityLabel="Export all readings as CSV" onPress={exporting ? undefined : exportAll} />
        <ListRow title={<Text color={colors.accent}>Sign out</Text>} accessibilityLabel="Sign out" onPress={() => signOut()} last />
      </Panel>

      <Panel>
        <Disclosure title="Advanced">
          <Box>
            <ToggleRow title="Dose estimate" description="Research simulation, not medical advice" value={settings.showDoseModel} onChange={(v) => set('showDoseModel', v)} />
            <Field label="Units" top>
              <Segmented<Units>
                accessibilityLabel="Amplitude units"
                options={[
                  { value: 'g', label: 'g' },
                  { value: 'ms2', label: 'm/s²' },
                ]}
                value={settings.units}
                onChange={(v) => set('units', v)}
              />
            </Field>
            <Field label="Axis handling">
              <Segmented<AnalysisMode>
                accessibilityLabel="Axis handling"
                options={[
                  { value: 'axes', label: 'Per-axis', hint: 'Recommended. Works however you hold the phone.' },
                  { value: 'magnitude', label: 'Magnitude', hint: 'Wrist-band style. History keeps the two separate.' },
                ]}
                value={settings.analysisMode}
                onChange={(v) => set('analysisMode', v)}
              />
            </Field>
            <ToggleRow title="Dev mode" description="Sensor diagnostics and raw CSV export" value={settings.devMode} onChange={(v) => set('devMode', v)} last />
          </Box>
        </Disclosure>
      </Panel>

      <Panel card="list">
        <ListRow title={<Text color={colors.signal}>Delete all data</Text>} accessibilityLabel="Delete all data" onPress={deleteAll} last />
      </Panel>
      <Text variant="caption" faint style={{ textAlign: 'center' }}>
        {DISCLAIMER_SENTENCE}
      </Text>
      <Text variant="caption" faint style={{ textAlign: 'center', marginTop: spacing.xs }}>
        Version {Constants.expoConfig?.version ?? '?'}
      </Text>
    </Screen>
  );
}

function Field({ label, children, last, top }: { label: string; children: React.ReactNode; last?: boolean; top?: boolean }) {
  return (
    <View style={{ marginBottom: last ? 0 : spacing.md, marginTop: top ? spacing.md : 0 }}>
      <Text variant="caption" muted style={{ marginBottom: spacing.sm }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
