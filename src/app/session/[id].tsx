import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { useRepository } from '@/data/repository-context';
import { POSITION_LABEL, type Session, type SessionTags } from '@/db/types';
import { deleteRawRecording, readTextFile, shareText } from '@/export/files';
import { formatDateTime } from '@/lib/format';
import { interpret } from '@/lib/interpret';
import { decodeSpectrum } from '@/lib/spectrum-json';
import { UNIT_LABEL, formatAccel, powerFromG } from '@/lib/units';
import { useSettings } from '@/state/settings-context';
import { useComparison } from '@/state/use-comparison';
import { SpectrumChart } from '@/ui/charts';
import { DoseModelPanel } from '@/ui/dose-model';
import { FlagList, MetricsTable, ReadingHero } from '@/ui/metrics';
import { Button, Disclosure, Notice, Panel, PositionMark, Row, Screen, Spacer, SpecRow, Text } from '@/ui/primitives';
import { TagEditor } from '@/ui/tag-editor';
import { spacing, useTheme } from '@/ui/theme';

export default function SessionDetailScreen() {
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const repo = useRepository();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    repo
      .getSession(id)
      .then(setSession)
      .catch(() => setSession(null));
  }, [repo, id]);

  if (session === undefined) {
    return (
      <Screen>
        <Text muted>Loading…</Text>
      </Screen>
    );
  }
  if (session === null) {
    return (
      <Screen>
        <Notice kind="error" title="Session not found" />
      </Screen>
    );
  }
  return <SessionView session={session} justSaved={saved === '1'} onChange={setSession} />;
}

function SessionView({ session, justSaved, onChange }: { session: Session; justSaved: boolean; onChange: (s: Session) => void }) {
  const repo = useRepository();
  const { settings } = useSettings();
  const { colors } = useTheme();
  const [tags, setTags] = useState<SessionTags>({
    sleep: session.sleep,
    stress: session.stress,
    caffeine: session.caffeine,
    medsTaken: session.medsTaken,
    medsTime: session.medsTime,
    notes: session.notes,
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const { previous, history } = useComparison(session.position, session.analysisMode, session.startedAt);

  const spectrum = useMemo(() => decodeSpectrum(session.spectrumJson), [session.spectrumJson]);
  const reading = useMemo(
    () =>
      interpret({
        position: session.position,
        rmsG: session.rmsG,
        dominantHz: session.dominantHz,
        peakRatio: session.peakRatio,
        spectralEntropy: session.spectralEntropy,
        previous,
        history,
      }),
    [session, previous, history],
  );

  const saveTags = useCallback(async () => {
    setBusy(true);
    try {
      await repo.updateSessionTags(session.id, tags);
      onChange({ ...session, ...tags });
      setDirty(false);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [repo, session, tags, onChange]);

  const remove = () => {
    Alert.alert('Delete this session?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            deleteRawRecording(session.rawPath);
            await repo.deleteSession(session.id);
            if (router.canGoBack()) router.back();
            else router.replace('/history');
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  const exportRaw = async () => {
    if (!session.rawPath) return;
    const csv = readTextFile(session.rawPath);
    if (!csv) {
      Alert.alert('Raw file missing', 'The raw recording for this session is no longer on the device.');
      return;
    }
    try {
      await shareText(`tremor_raw_${session.position}_${session.startedAt.replace(/[:.]/g, '-')}.csv`, csv, 'text/csv', 'Export raw samples');
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  const u = settings.units;
  const hasWarnings = session.qualityFlags.length > 0;

  return (
    <Screen>
      <Row gap={spacing.sm} style={{ alignItems: 'center', paddingBottom: spacing.md, paddingHorizontal: spacing.xs }}>
        <PositionMark position={session.position} />
        <Text variant="caption" faint style={{ flex: 1 }}>
          {POSITION_LABEL[session.position]} · {formatDateTime(session.startedAt)}
        </Text>
        {justSaved ? (
          <Row gap={spacing.xs} style={{ alignItems: 'center' }} accessible accessibilityLabel="Saved" accessibilityLiveRegion="polite">
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text variant="caption" color={colors.accent}>
              Saved
            </Text>
          </Row>
        ) : null}
      </Row>

      <ReadingHero reading={reading} rmsG={session.rmsG} dominantHz={session.dominantHz} previousG={previous?.rmsG} units={u} />
      <Spacer size={spacing.xl} />

      <Panel
        label="Tags"
        card
        right={dirty ? <Button title="Save" variant="ghost" size="sm" onPress={saveTags} loading={busy} /> : <Text variant="caption" faint>optional</Text>}>
        <TagEditor
          value={tags}
          onChange={(t) => {
            setTags(t);
            setDirty(true);
          }}
        />
      </Panel>

      {settings.showDoseModel ? (
        <>
          <Disclosure title="Dose estimate">
            <DoseModelPanel rmsG={session.rmsG} />
          </Disclosure>
          <Spacer size={spacing.sm} />
        </>
      ) : null}

      <View style={{ marginBottom: spacing.lg }}>
        <Disclosure title="More numbers" subtitle={hasWarnings ? `${session.qualityFlags.length} recording warning${session.qualityFlags.length > 1 ? 's' : ''}` : undefined}>
          {spectrum ? (
            <>
              <SpectrumChart f={spectrum.f} psd={spectrum.psd} peakHz={session.dominantHz} />
              <Spacer size={spacing.lg} />
            </>
          ) : null}
          <MetricsTable m={session} units={u} />
          <SpecRow k="Band power 4–12 Hz" v={`${powerFromG(session.bandPower, u).toExponential(3)} ${UNIT_LABEL[u]}²`} />
          <SpecRow k="Slow motion, 0–1 Hz RMS" v={formatAccel(session.lfMotionRmsG, u)} />
          <SpecRow k="Sensor rate" v={`${session.measuredFsHz.toFixed(1)} Hz · jitter ${session.jitter.toFixed(3)}`} />
          <SpecRow k="Analysis mode" v={session.analysisMode === 'axes' ? 'per-axis' : 'vector magnitude'} />
          <SpecRow k="Device" v={`${session.deviceModel ?? 'unknown'} · app ${session.appVersion ?? '?'}`} last />
          {hasWarnings ? (
            <>
              <Spacer size={spacing.md} />
              <FlagList flags={session.qualityFlags} />
            </>
          ) : null}
          {settings.devMode && session.rawPath ? (
            <>
              <Spacer size={spacing.md} />
              <Button title="Export raw CSV (m/s²)" variant="secondary" onPress={exportRaw} />
            </>
          ) : null}
        </Disclosure>
      </View>

      <Button title="Delete reading" variant="danger" onPress={remove} accessibilityLabel="Delete this reading" />
    </Screen>
  );
}
