import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useSettings } from '@/state/settings-context';
import { Box, Button, Screen, Spacer, Text } from '@/ui/primitives';
import { radius, spacing, useTheme } from '@/ui/theme';

export default function DisclaimerScreen() {
  const { set } = useSettings();
  const { colors } = useTheme();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    setSaving(true);
    try {
      await set('disclaimerAccepted', true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen safeTop>
      <Spacer size={spacing.xxl} />
      <Text variant="display">Track your tremor</Text>
      <Spacer size={spacing.sm} />
      <Text muted>Tremor Tracker measures hand tremor using your phone’s motion sensors.</Text>
      <Spacer size={spacing.lg} />

      <Box>
        <Bullet>Not a medical device. Doesn’t diagnose anything.</Bullet>
        <Bullet>Readings sync to your account and work offline.</Bullet>
      </Box>

      <Spacer size={spacing.lg} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => setChecked((c) => !c)}
        style={({ pressed }) => [styles.check, { backgroundColor: pressed ? colors.inset : 'transparent' }]}>
        <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={checked ? colors.accent : colors.hairlineStrong} />
        <Text style={{ flex: 1 }}>I understand this app is not a medical device.</Text>
      </Pressable>
      <Spacer size={spacing.md} />
      <Button title="Continue" size="lg" onPress={accept} disabled={!checked} loading={saving} />
    </Screen>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <Text variant="caption" muted style={{ marginBottom: 8 }}>
      • {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
});
