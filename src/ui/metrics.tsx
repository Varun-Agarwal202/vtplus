import React from 'react';
import { View } from 'react-native';

import type { Units } from '@/db/settings';
import type { QualityFlag, QualityIssue } from '@/dsp/types';
import { QUALITY_FLAG_LABEL } from '@/lib/format';
import { type Interpretation } from '@/lib/interpret';
import { UNIT_LABEL, formatAccelValue } from '@/lib/units';
import { AmplitudeScale } from './charts';
import { Box, Notice, Readout, ResponsiveRow, Row, Rule, Spacer, SpecRow, Text } from './primitives';
import { spacing, useTheme } from './theme';

/**
 * The top of a result: one sentence in plain language, the two readings that
 * matter, and the amplitude ruler.
 */
export function ReadingHero({
  reading,
  rmsG,
  dominantHz,
  previousG,
  units,
}: {
  reading: Interpretation;
  rmsG: number;
  dominantHz: number;
  previousG?: number | null;
  units: Units;
}) {
  return (
    <Box>
      <Text variant="title" accessibilityRole="header">
        {reading.level.label} movement
      </Text>
      {reading.change ? (
        <Text variant="caption" muted style={{ marginTop: 2 }}>
          {reading.change.sentence}
        </Text>
      ) : null}
      <Spacer size={spacing.md} />
      <ResponsiveRow>
        <Readout
          label="Amplitude"
          value={formatAccelValue(rmsG, units, units === 'g' ? 3 : 2)}
          unit={UNIT_LABEL[units]}
          unitSpoken={units === 'g' ? 'g' : 'metres per second squared'}
          style={{ flex: 1 }}
        />
        <Readout label="Rate" value={dominantHz.toFixed(1)} unit="/s" unitSpoken="times a second" style={{ flex: 1 }} />
      </ResponsiveRow>
      <Spacer size={spacing.lg} />
      <AmplitudeScale rmsG={rmsG} previousG={previousG} />
    </Box>
  );
}

/** The "what this means" list: level meaning, rhythm, steadiness, history. */
export function MeaningList({ reading }: { reading: Interpretation }) {
  const items: { k: string; v: string; d?: string }[] = [
    { k: 'Level', v: reading.level.label, d: reading.level.meaning },
    { k: 'Rhythm', v: reading.rhythm.label, d: reading.rhythm.detail },
  ];
  if (reading.steadiness) items.push({ k: 'Over the recording', v: reading.steadiness.label, d: reading.steadiness.detail });
  if (reading.frequencyChange) items.push({ k: 'Rate', v: 'vs. last session', d: reading.frequencyChange });
  if (reading.history) items.push({ k: 'Your history', v: '', d: reading.history });
  return (
    <View>
      {items.map((it, i) => (
        <View key={it.k}>
          <Row gap={spacing.md} style={{ paddingVertical: 12, alignItems: 'flex-start' }}>
            <Text variant="caption" faint style={{ width: 96, paddingTop: 1 }}>
              {it.k}
            </Text>
            <View style={{ flex: 1 }}>
              {it.v ? <Text variant="subheading">{it.v}</Text> : null}
              {it.d ? (
                <Text variant="caption" muted style={{ marginTop: it.v ? 2 : 0 }}>
                  {it.d}
                </Text>
              ) : null}
            </View>
          </Row>
          {i < items.length - 1 ? <Rule /> : null}
        </View>
      ))}
    </View>
  );
}

export interface MetricValues {
  dominantHz: number;
  dominantHzInterp?: number;
  rmsG: number;
  peakRatio: number;
  spectralEntropy: number;
  bandPower: number;
}

/** The raw numbers, as a spec table, for people who want them. */
export function MetricsTable({ m, units }: { m: MetricValues; units: Units }) {
  return (
    <View>
      <SpecRow k="Dominant frequency" v={`${m.dominantHz.toFixed(2)} Hz`} hint={m.dominantHzInterp !== undefined ? `refined ${m.dominantHzInterp.toFixed(2)} Hz` : undefined} />
      <SpecRow k="Amplitude, RMS 4–12 Hz" v={`${formatAccelValue(m.rmsG, units)} ${UNIT_LABEL[units]}`} />
      <SpecRow k="Peak ratio" v={m.peakRatio.toFixed(2)} hint="power within ±1 Hz of the peak ÷ power 1–20 Hz" />
      <SpecRow k="Spectral entropy" v={m.spectralEntropy.toFixed(2)} hint="0 = pure tone, 1 = flat" last />
    </View>
  );
}

export function IssueList({ issues }: { issues: QualityIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {issues.map((i) => (
        <Notice key={i.flag} kind={i.fatal ? 'error' : 'attention'} title={QUALITY_FLAG_LABEL[i.flag]}>
          {i.message}
        </Notice>
      ))}
    </View>
  );
}

export function FlagList({ flags }: { flags: QualityFlag[] }) {
  const { colors } = useTheme();
  if (flags.length === 0) {
    return (
      <Text variant="caption" muted>
        No quality warnings. The sensor rate, timing and recording length were all fine.
      </Text>
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {flags.map((f) => (
        <Row key={f} gap={spacing.sm} style={{ alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.signal }} />
          <Text variant="caption">{QUALITY_FLAG_LABEL[f]}</Text>
        </Row>
      ))}
    </View>
  );
}
