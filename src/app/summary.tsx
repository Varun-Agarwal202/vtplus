import Constants from 'expo-constants';
import * as Device from 'expo-device';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { useRepository } from '@/data/repository-context';
import { POSITION_LABEL, POSITIONS, type Session } from '@/db/types';
import { shareHtmlAsPdf } from '@/export/files';
import { buildSummaryHtml } from '@/export/summary';
import { formatDate, isoDaysAgo, median } from '@/lib/format';
import { UNIT_LABEL, fromG } from '@/lib/units';
import { useSettings } from '@/state/settings-context';
import { Button, Chip, Panel, PositionMark, Row, Screen, Spacer, Text } from '@/ui/primitives';
import { spacing } from '@/ui/theme';

type Range = 30 | 90 | 180 | 0;
const RANGES: { value: Range; label: string }[] = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '6 months' },
  { value: 0, label: 'All' },
];

export default function SummaryScreen() {
  const repo = useRepository();
  const { settings } = useSettings();
  const [range, setRange] = useState<Range>(90);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    repo
      .listSessions({ since: range ? isoDaysAgo(range) : undefined, analysisMode: settings.analysisMode })
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [repo, range, settings.analysisMode]);

  const rangeLabel = useMemo(() => {
    if (sessions.length === 0) return range ? `Last ${RANGES.find((r) => r.value === range)?.label}` : 'All sessions';
    const first = sessions[sessions.length - 1].startedAt;
    const last = sessions[0].startedAt;
    return `${formatDate(first)} – ${formatDate(last)}`;
  }, [sessions, range]);

  const generate = async () => {
    setBusy(true);
    try {
      const html = buildSummaryHtml({
        sessions,
        units: settings.units,
        rangeLabel,
        appVersion: Constants.expoConfig?.version ?? '',
        deviceModel: Device.modelName ?? null,
      });
      await shareHtmlAsPdf(html, 'Share clinician summary');
    } catch (e) {
      Alert.alert('Could not create PDF', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const u = UNIT_LABEL[settings.units];

  return (
    <Screen>
      <Text muted style={{ paddingTop: spacing.sm }}>
        A one-page PDF of your sessions to share. Not a diagnosis.
      </Text>
      <Spacer size={spacing.md} />
      <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
        {RANGES.map((r) => (
          <Chip key={r.value} label={r.label} selected={range === r.value} onPress={() => setRange(r.value)} />
        ))}
      </Row>
      <Spacer size={spacing.lg} />

      <Panel label="Preview" right={<Text variant="caption" faint>{rangeLabel}</Text>}>
        {sessions.length === 0 ? (
          <Text muted>No sessions in this range.</Text>
        ) : (
          POSITIONS.map((p) => {
            const ss = sessions.filter((s) => s.position === p);
            if (ss.length === 0) return null;
            const hz = median(ss.map((s) => s.dominantHz));
            const rms = median(ss.map((s) => fromG(s.rmsG, settings.units)));
            return (
              <Row key={p} style={{ justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }}>
                <Row gap={spacing.sm} style={{ alignItems: 'center' }}>
                  <PositionMark position={p} size={9} />
                  <Text>
                    {POSITION_LABEL[p]} <Text muted>({ss.length})</Text>
                  </Text>
                </Row>
                <Text variant="mono">
                  {hz?.toFixed(2)} Hz · {rms?.toFixed(settings.units === 'g' ? 4 : 3)} {u}
                </Text>
              </Row>
            );
          })
        )}
      </Panel>

      <Button title="Create PDF and share" onPress={generate} loading={busy} disabled={sessions.length === 0} />
    </Screen>
  );
}
