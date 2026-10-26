import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { useRepository } from '@/data/repository-context';
import { POSITION_LABEL, POSITIONS, type Position, type Session } from '@/db/types';
import { formatDateTime, isoDaysAgo, median } from '@/lib/format';
import { levelFor, trendSentence } from '@/lib/interpret';
import { UNIT_LABEL, formatAccelValue, fromG } from '@/lib/units';
import { useSettings } from '@/state/settings-context';
import { TrendChart, type TrendPoint } from '@/ui/charts';
import { Box, Chevron, ListRow, Panel, Readout, ResponsiveRow, Row, Screen, Segmented, Spacer, Text } from '@/ui/primitives';
import { spacing, useTheme } from '@/ui/theme';

type Range = 7 | 30 | 90 | 0;

const RANGES: { value: Range; label: string }[] = [
  { value: 7, label: 'Week' },
  { value: 30, label: 'Month' },
  { value: 90, label: '3 months' },
  { value: 0, label: 'All' },
];

export default function HistoryScreen() {
  const repo = useRepository();
  const { settings } = useSettings();
  const { colors, smallTarget } = useTheme();
  const [position, setPosition] = useState<Position>(settings.defaultPosition);
  const [range, setRange] = useState<Range>(30);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await repo.listSessions({
        position,
        since: range ? isoDaysAgo(range) : undefined,
        analysisMode: settings.analysisMode,
      });
      setSessions(rows);
    } finally {
      setLoading(false);
    }
  }, [repo, position, range, settings.analysisMode]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => console.warn(e));
    }, [load]),
  );

  const u = settings.units;
  const points: TrendPoint[] = useMemo(
    () =>
      sessions.map((s) => ({
        id: s.id,
        t: Date.parse(s.startedAt),
        v: fromG(s.rmsG, u),
        position: s.position,
        flagged: s.qualityFlags.length > 0,
      })),
    [sessions, u],
  );
  const medianG = useMemo(() => median(sessions.map((s) => s.rmsG)), [sessions]);
  const medianHz = useMemo(() => median(sessions.map((s) => s.dominantHz)), [sessions]);
  const trend = useMemo(
    () => trendSentence(sessions.map((s) => ({ t: Date.parse(s.startedAt), v: s.rmsG })), POSITION_LABEL[position].toLowerCase(), range || null),
    [sessions, position, range],
  );
  const openSession = (id: string) => router.push({ pathname: '/session/[id]', params: { id } });
  const positionLabel = POSITION_LABEL[position].toLowerCase();

  return (
    <Screen safeTop>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }}>
        <Text variant="display">History</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clinician summary"
          accessibilityHint="Makes a one-page PDF to share with your doctor"
          hitSlop={12}
          onPress={() => router.push('/summary')}
          style={({ pressed }) => ({
            minWidth: smallTarget,
            minHeight: smallTarget,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: smallTarget / 2,
            backgroundColor: pressed ? colors.inset : 'transparent',
          })}>
          <Ionicons name="document-text-outline" size={26} color={colors.accent} />
        </Pressable>
      </Row>
      <Spacer size={spacing.lg} />
      <Segmented<Position> accessibilityLabel="Position" options={POSITIONS.map((p) => ({ value: p, label: POSITION_LABEL[p] }))} value={position} onChange={setPosition} />
      <Spacer size={spacing.sm} />
      <Segmented<string>
        accessibilityLabel="Time range"
        options={RANGES.map((r) => ({ value: String(r.value), label: r.label }))}
        value={String(range)}
        onChange={(v) => setRange(Number(v) as Range)}
      />
      <Spacer size={spacing.xl} />

      {sessions.length === 0 ? (
        <Box>
          <Text muted>{loading ? 'Loading…' : `No ${positionLabel} readings in this range.`}</Text>
        </Box>
      ) : (
        <>
          <Box>
            <ResponsiveRow>
              <Readout
                label="Typical"
                value={medianG !== null ? levelFor(medianG).label : '–'}
                caption={medianG !== null ? `${formatAccelValue(medianG, u, u === 'g' ? 3 : 2)} ${UNIT_LABEL[u]}` : undefined}
                style={{ flex: 1 }}
              />
              <Readout label="Rate" value={medianHz !== null ? medianHz.toFixed(1) : '–'} unit="/s" unitSpoken="times a second" style={{ flex: 1 }} />
            </ResponsiveRow>
            {trend ? (
              <Text variant="caption" muted style={{ marginTop: spacing.sm }}>
                {trend}
              </Text>
            ) : null}
            <Spacer size={spacing.md} />
            <TrendChart points={points} yMin={0} formatY={(v) => (u === 'g' ? v.toFixed(2) : v.toFixed(1))} onPressPoint={openSession} />
          </Box>
          <Spacer size={spacing.xl} />

          <Panel label={`${sessions.length} reading${sessions.length === 1 ? '' : 's'}`} card="list">
            {sessions.map((s, i) => (
              <ListRow
                key={s.id}
                title={<Text variant="subheading">{levelFor(s.rmsG).label}</Text>}
                subtitle={`${formatDateTime(s.startedAt)}${s.qualityFlags.length ? ` · ${s.qualityFlags.length} warning${s.qualityFlags.length > 1 ? 's' : ''}` : ''}`}
                right={
                  <Row gap={4} style={{ alignItems: 'center' }}>
                    <Text variant="mono" muted>
                      {s.dominantHz.toFixed(1)}/s
                    </Text>
                    <Chevron />
                  </Row>
                }
                accessibilityLabel={`${formatDateTime(s.startedAt)}. ${levelFor(s.rmsG).label} movement, ${s.dominantHz.toFixed(1)} times a second, amplitude ${formatAccelValue(s.rmsG, u, u === 'g' ? 3 : 2)} ${UNIT_LABEL[u]}.${
                  s.qualityFlags.length ? ` ${s.qualityFlags.length} warning${s.qualityFlags.length > 1 ? 's' : ''}.` : ''
                }`}
                accessibilityHint="Opens this reading"
                onPress={() => openSession(s.id)}
                last={i === sessions.length - 1}
              />
            ))}
          </Panel>
        </>
      )}
    </Screen>
  );
}
