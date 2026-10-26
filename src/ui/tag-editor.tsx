import React from 'react';
import { TextInput, View } from 'react-native';

import type { SessionTags, Sleep } from '@/db/types';
import { Chip, Row, Spacer, Text } from './primitives';
import { radius, spacing, useTheme } from './theme';

const SLEEP: { value: Sleep; label: string }[] = [
  { value: 'poor', label: 'Poor' },
  { value: 'ok', label: 'OK' },
  { value: 'good', label: 'Good' },
];

const STRESS_WORD = ['', 'calm', 'a little stressed', 'somewhat stressed', 'stressed', 'very stressed'];

/**
 * Optional self-reported context. Every field can be left empty, and every
 * field toggles off when tapped again. Medication is a log entry only: the app
 * never interprets it.
 */
export function TagEditor({ value, onChange }: { value: SessionTags; onChange: (next: SessionTags) => void }) {
  const { colors, textScale, highContrast, smallTarget } = useTheme();
  const set = <K extends keyof SessionTags>(k: K, v: SessionTags[K]) => onChange({ ...value, [k]: v });
  const toggle = <K extends keyof SessionTags>(k: K, v: SessionTags[K]) => set(k, value[k] === v ? (null as SessionTags[K]) : v);
  const input = {
    borderWidth: highContrast ? 2 : 0,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.md,
    borderCurve: 'continuous' as const,
    color: colors.ink,
    backgroundColor: colors.inset,
    fontSize: 17 * textScale,
  };

  return (
    <View>
      <Field label="Sleep">
        <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
          {SLEEP.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              accessibilityLabel={`Sleep last night: ${o.label}`}
              selected={value.sleep === o.value}
              onPress={() => toggle('sleep', o.value)}
            />
          ))}
        </Row>
      </Field>

      <Field label="Stress" note="1 calm · 5 high">
        <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip
              key={n}
              label={String(n)}
              accessibilityLabel={`Stress ${n} of 5, ${STRESS_WORD[n]}`}
              selected={value.stress === n}
              onPress={() => toggle('stress', n)}
            />
          ))}
        </Row>
      </Field>

      <Field label="Caffeine" note="last few hours">
        <Row gap={spacing.sm}>
          <Chip label="Yes" accessibilityLabel="Had caffeine: yes" selected={value.caffeine === true} onPress={() => toggle('caffeine', true)} />
          <Chip label="No" accessibilityLabel="Had caffeine: no" selected={value.caffeine === false} onPress={() => toggle('caffeine', false)} />
        </Row>
      </Field>

      <Field label="Medication taken">
        <Row gap={spacing.sm} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip label="Yes" accessibilityLabel="Took my medication: yes" selected={value.medsTaken === true} onPress={() => toggle('medsTaken', true)} />
          <Chip label="No" accessibilityLabel="Took my medication: no" selected={value.medsTaken === false} onPress={() => toggle('medsTaken', false)} />
          {value.medsTaken ? (
            <TextInput
              value={value.medsTime ?? ''}
              onChangeText={(t) => set('medsTime', t.trim() ? t : null)}
              placeholder="Time, e.g. 08:30"
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Time you took your medication"
              accessibilityHint="For example 8 30. Used to show when readings are lowest after a dose."
              maxFontSizeMultiplier={2}
              style={[input, { flex: 1, minWidth: 140, minHeight: smallTarget, paddingHorizontal: spacing.md }]}
            />
          ) : null}
        </Row>
      </Field>

      <Field label="Notes" last>
        <TextInput
          value={value.notes ?? ''}
          onChangeText={(t) => set('notes', t.length ? t : null)}
          placeholder="Optional"
          placeholderTextColor={colors.ink3}
          accessibilityLabel="Notes"
          accessibilityHint="Anything worth remembering about this session. You can use dictation."
          maxFontSizeMultiplier={2}
          multiline
          style={[input, { minHeight: 80, padding: spacing.md, textAlignVertical: 'top' }]}
        />
      </Field>
    </View>
  );
}

function Field({ label, note, last, children }: { label: string; note?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: last ? 0 : spacing.lg }}>
      <Text variant="subheading" accessibilityRole="header">
        {label}
        {note ? (
          <Text variant="caption" faint>
            {'  '}
            {note}
          </Text>
        ) : null}
      </Text>
      <Spacer size={spacing.sm} />
      {children}
    </View>
  );
}
