import { router } from 'expo-router';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { announce } from '@/lib/feedback';
import {
  CONDITION_LABEL,
  HAND_LABEL,
  TASK_LABEL,
  TRIGGER_LABEL,
  type Condition,
  type Hand,
  type HardTask,
  type Profile,
  type Trigger,
} from '@/lib/profile';
import { useSettings } from '@/state/settings-context';
import { Button, Chip, Panel, Row, Screen, Spacer, Text } from '@/ui/primitives';
import { radius, spacing, useTheme } from '@/ui/theme';

function keys<T extends string>(o: Record<T, string>): T[] {
  return Object.keys(o) as T[];
}

export default function ProfileScreen() {
  const { settings, set } = useSettings();
  const { colors, textScale, target, highContrast } = useTheme();
  const [p, setP] = useState<Profile>(settings.profile);
  const first = !settings.profile.onboarded;

  const update = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((cur) => ({ ...cur, [k]: v }));
  const toggleIn = <T extends string>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async () => {
    await set('profile', { ...p, name: p.name?.trim() || null, medName: p.takesMeds ? p.medName?.trim() || null : null, onboarded: true });
    announce('Profile saved');
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const input = {
    backgroundColor: colors.inset,
    color: colors.ink,
    borderRadius: radius.md,
    borderCurve: 'continuous' as const,
    borderWidth: highContrast ? 2 : 0,
    borderColor: colors.hairlineStrong,
    paddingHorizontal: spacing.md,
    minHeight: target,
    fontSize: 17 * textScale,
  };

  return (
    <Screen>
      {first ? (
        <Text variant="caption" muted style={{ paddingHorizontal: 4, marginBottom: spacing.md }}>
          All fields are optional.
        </Text>
      ) : null}

      <Panel label="Name" card>
        <TextInput
          value={p.name ?? ''}
          onChangeText={(t) => update('name', t)}
          placeholder="First name"
          placeholderTextColor={colors.ink3}
          accessibilityLabel="Your first name"
          autoCapitalize="words"
          textContentType="givenName"
          maxLength={40}
          maxFontSizeMultiplier={2}
          style={input}
        />
      </Panel>

      <Panel label="Diagnosis" card>
        <ChipGroup<Condition>
          label="Diagnosis"
          options={keys(CONDITION_LABEL).map((k) => ({ value: k, label: CONDITION_LABEL[k] }))}
          isOn={(v) => p.condition === v}
          onPress={(v) => update('condition', p.condition === v ? null : v)}
        />
      </Panel>

      <Panel label="Most affected hand" card>
        <ChipGroup<Hand>
          label="Most affected hand"
          options={keys(HAND_LABEL).map((k) => ({ value: k, label: HAND_LABEL[k] }))}
          isOn={(v) => p.hand === v}
          onPress={(v) => update('hand', p.hand === v ? null : v)}
        />
      </Panel>

      <Panel label="Difficult tasks" right={<Text variant="caption" faint>Select all that apply</Text>} card>
        <ChipGroup<HardTask>
          label="Difficult tasks"
          options={keys(TASK_LABEL).map((k) => ({ value: k, label: TASK_LABEL[k] }))}
          isOn={(v) => p.hardTasks.includes(v)}
          onPress={(v) => update('hardTasks', toggleIn(p.hardTasks, v))}
        />
      </Panel>

      <Panel label="Possible triggers" right={<Text variant="caption" faint>Select all that apply</Text>} card>
        <ChipGroup<Trigger>
          label="Possible triggers"
          options={keys(TRIGGER_LABEL).map((k) => ({ value: k, label: TRIGGER_LABEL[k] }))}
          isOn={(v) => p.triggers.includes(v)}
          onPress={(v) => update('triggers', toggleIn(p.triggers, v))}
        />
        <Text variant="caption" faint style={{ marginTop: spacing.sm }}>
          Compared against your tagged readings in Insights.
        </Text>
      </Panel>

      <Panel label="Tremor medication" card>
        <Row gap={spacing.sm}>
          <Chip label="Yes" accessibilityLabel="Tremor medication: yes" selected={p.takesMeds === true} onPress={() => update('takesMeds', p.takesMeds === true ? null : true)} />
          <Chip label="No" accessibilityLabel="Tremor medication: no" selected={p.takesMeds === false} onPress={() => update('takesMeds', p.takesMeds === false ? null : false)} />
        </Row>
        {p.takesMeds ? (
          <>
            <Spacer size={spacing.sm} />
            <TextInput
              value={p.medName ?? ''}
              onChangeText={(t) => update('medName', t)}
              placeholder="Medication name (optional)"
              placeholderTextColor={colors.ink3}
              accessibilityLabel="Medication name, optional"
              autoCapitalize="none"
              maxLength={60}
              maxFontSizeMultiplier={2}
              style={input}
            />
          </>
        ) : null}
      </Panel>

      <View>
        <Button title="Save" size="lg" onPress={save} />
        <Text variant="caption" faint style={{ textAlign: 'center', marginTop: spacing.sm }}>
          Synced to your account.
        </Text>
      </View>
    </Screen>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  isOn,
  onPress,
}: {
  label: string;
  options: { value: T; label: string }[];
  isOn: (v: T) => boolean;
  onPress: (v: T) => void;
}) {
  return (
    <View accessibilityLabel={label}>
      <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} accessibilityLabel={`${label}: ${o.label}`} selected={isOn(o.value)} onPress={() => onPress(o.value)} />
        ))}
      </Row>
    </View>
  );
}
