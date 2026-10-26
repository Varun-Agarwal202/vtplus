import React from 'react';
import { Alert, Linking } from 'react-native';

import { announce } from '@/lib/feedback';
import { useDevicePrefs, type TextSize, type ThemeMode } from '@/state/device-prefs';
import { Box, Button, Chevron, ListRow, Panel, Screen, Segmented, Spacer, Text, ToggleRow } from '@/ui/primitives';
import { spacing, useTheme } from '@/ui/theme';

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 'default', label: 'A' },
  { value: 'large', label: 'A+' },
  { value: 'larger', label: 'A++' },
  { value: 'largest', label: 'A+++' },
];
const TEXT_SIZE_SPOKEN: Record<TextSize, string> = { default: 'Default', large: 'Large', larger: 'Larger', largest: 'Largest' };

const THEMES: { value: ThemeMode; label: string; hint: string; spoken?: string }[] = [
  { value: 'system', label: 'Auto', spoken: 'Match phone', hint: 'Follows your phone’s light or dark setting' },
  { value: 'light', label: 'Light', hint: 'Dark text on a light background' },
  { value: 'dark', label: 'Dark', hint: 'Light text on a dark background' },
];

export default function AccessibilityScreen() {
  const { prefs, set, reset, system } = useDevicePrefs();
  const { colors } = useTheme();

  const tremorPreset = () => {
    set('largeTargets', true);
    set('tapGuard', true);
    set('haptics', true);
    if (prefs.textSize === 'default') set('textSize', 'large');
    announce('Recommended settings applied', { force: true });
  };

  const confirmReset = () =>
    Alert.alert('Reset display settings?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: reset },
    ]);

  return (
    <Screen>
      <Box>
        <Text variant="subheading">Recommended for tremor</Text>
        <Text variant="caption" faint style={{ marginTop: 2 }}>
          Larger text and buttons, and repeated taps ignored.
        </Text>
        <Spacer size={spacing.md} />
        <Button title="Apply" onPress={tremorPreset} accessibilityLabel="Apply recommended settings for tremor" />
      </Box>
      <Spacer size={spacing.xl} />

      <Panel label="Appearance" card>
        <Segmented<ThemeMode> accessibilityLabel="Theme" options={THEMES} value={prefs.themeMode} onChange={(v) => set('themeMode', v)} />
        <Spacer size={spacing.md} />
        <Text variant="caption" muted style={{ marginBottom: spacing.sm }}>
          Text size
        </Text>
        <Segmented<TextSize>
          accessibilityLabel="Text size"
          options={TEXT_SIZES.map((t) => ({ ...t, spoken: TEXT_SIZE_SPOKEN[t.value] }))}
          value={prefs.textSize}
          onChange={(v) => set('textSize', v)}
        />
        <Spacer size={spacing.sm} />
        <ToggleRow
          title="High contrast"
          hint="Pure black and white with stronger borders. Easier to read in bright light or with low vision."
          value={prefs.highContrast}
          onChange={(v) => set('highContrast', v)}
          last
        />
      </Panel>

      <Panel label="Touch" card="list">
        <ToggleRow title="Larger buttons" hint="Makes every button, choice and row taller so it’s easier to hit." value={prefs.largeTargets} onChange={(v) => set('largeTargets', v)} />
        <ToggleRow
          title="Ignore repeated taps"
          hint="After a tap, the next tap within about half a second is ignored."
          value={prefs.tapGuard}
          onChange={(v) => set('tapGuard', v)}
          last
        />
      </Panel>

      <Panel label="Sound & motion" card="list">
        <ToggleRow
          title="Speak instructions"
          hint="Reads the countdown, what to do and your result aloud, so you don’t need to look at the screen while measuring."
          value={prefs.voiceGuidance}
          onChange={(v) => {
            set('voiceGuidance', v);
            if (v) announce('Spoken instructions on', { force: true });
          }}
        />
        <ToggleRow title="Vibration cues" hint="A buzz at each countdown second, when recording starts, and when it finishes." value={prefs.haptics} onChange={(v) => set('haptics', v)} />
        <ToggleRow
          title="Reduce motion"
          description={system.reduceMotion ? 'On in your phone’s settings' : undefined}
          hint="Turns off the moving waveform, the breathing animation, sliding transitions and springy button movement."
          value={prefs.reduceMotion || system.reduceMotion}
          onChange={(v) => set('reduceMotion', v)}
          last
        />
      </Panel>

      <Panel card="list">
        <ListRow
          title="Phone settings"
          accessibilityHint="Opens this app’s page in your phone’s settings, for notifications and more"
          right={<Chevron />}
          onPress={() => Linking.openSettings().catch(() => undefined)}
          last
        />
      </Panel>

      <Panel card="list" style={{ marginBottom: 0 }}>
        <ListRow title={<Text color={colors.signal}>Reset display settings</Text>} accessibilityLabel="Reset display settings" onPress={confirmReset} last />
      </Panel>
    </Screen>
  );
}
