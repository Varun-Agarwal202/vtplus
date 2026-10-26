import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Redirect, router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { useRepository } from '@/data/repository-context';
import { EMPTY_TAGS, POSITION_LABEL, type NewSession, type SessionTags } from '@/db/types';
import { rawSamplesCsv } from '@/export/csv';
import { saveRawRecording, shareText } from '@/export/files';
import { announce, haptic } from '@/lib/feedback';
import { formatDateTime } from '@/lib/format';
import { interpret } from '@/lib/interpret';
import { encodeSpectrum } from '@/lib/spectrum-json';
import { UNIT_LABEL, formatAccelValue } from '@/lib/units';
import { getPendingRecording, setPendingRecording } from '@/state/pending-recording';
import { useSettings } from '@/state/settings-context';
import { useComparison } from '@/state/use-comparison';
import { BarStrip, SpectrumChart } from '@/ui/charts';
import { DoseModelPanel } from '@/ui/dose-model';
import { IssueList, MetricsTable, ReadingHero } from '@/ui/metrics';
import { Button, Disclosure, Notice, Panel, PositionMark, Row, Screen, Spacer, SpecRow, Text } from '@/ui/primitives';
import { TagEditor } from '@/ui/tag-editor';
import { spacing } from '@/ui/theme';

export default function ResultScreen() {
  const pending = useMemo(() => getPendingRecording(), []);
  if (!pending) return <Redirect href="/" />;
  return <ResultView pending={pending} />;
}

function ResultView({ pending }: { pending: NonNullable<ReturnType<typeof getPendingRecording>> }) {
  const { recording, position, result } = pending;
  const { settings } = useSettings();
  const repo = useRepository();
  const [tags, setTags] = useState<SessionTags>(EMPTY_TAGS);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const startedAtIso = useMemo(() => recording.startedAt.toISOString(), [recording.startedAt]);
  const { previous, history } = useComparison(position, result.mode, startedAtIso);

  const reading = useMemo(
    () =>
      interpret({
        position,
        rmsG: result.rms,
        dominantHz: result.dominantHz,
        peakRatio: result.peakRatio,
        spectralEntropy: result.spectralEntropy,
        rmsTimeline: result.rmsTimeline,
        previous,
        history,
      }),
    [position, result, previous, history],
  );

  const spokenResult = result.ok
    ? `${reading.headline}. About ${result.dominantHz.toFixed(1)} times a second. ${reading.change?.sentence ?? ''}`
    : 'This recording can’t be used. Please record again.';
  useEffect(() => {
    const id = setTimeout(() => announce(spokenResult), 600);
    return () => clearTimeout(id);
    // speak once, when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discard = () => {
    Alert.alert('Discard this recording?', 'Nothing will be saved.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setPendingRecording(null);
          router.replace('/');
        },
      },
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const base: NewSession = {
        startedAt: startedAtIso,
        durationS: result.durationS,
        position,
        measuredFsHz: result.measuredFsHz,
        jitter: result.jitter,
        dominantHz: result.dominantHz,
        dominantHzInterp: result.dominantHzInterp,
        bandPower: result.bandPower,
        rmsG: result.rms,
        peakRatio: result.peakRatio,
        spectralEntropy: result.spectralEntropy,
        lfMotionRmsG: result.lfMotionRms,
        qualityFlags: result.issues.map((i) => i.flag),
        analysisMode: result.mode,
        deviceModel: Device.modelName ?? null,
        appVersion: Constants.expoConfig?.version ?? null,
        rawPath: null,
        spectrumJson: encodeSpectrum(result.spectrum),
        ...tags,
      };
      const session = await repo.insertSession(base);
      if (settings.devMode) {
        try {
          const uri = saveRawRecording(session.id, rawSamplesCsv(recording.samples, 'ms2'));
          await repo.setSessionRawPath(session.id, uri);
        } catch (e) {
          console.warn('raw save failed', e);
        }
      }
      setPendingRecording(null);
      haptic('success');
      router.replace({ pathname: '/session/[id]', params: { id: session.id, saved: '1' } });
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const exportRaw = async () => {
    setExporting(true);
    try {
      const name = `tremor_raw_${position}_${startedAtIso.replace(/[:.]/g, '-')}.csv`;
      await shareText(name, rawSamplesCsv(recording.samples, 'ms2'), 'text/csv', 'Export raw samples');
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const fatal = !result.ok;
  const u = settings.units;

  return (
    <Screen>
      <Row gap={spacing.sm} style={{ alignItems: 'center', paddingBottom: spacing.md, paddingHorizontal: spacing.xs }}>
        <PositionMark position={position} />
        <Text variant="caption" faint>
          {POSITION_LABEL[position]} · {formatDateTime(startedAtIso)}
        </Text>
      </Row>

      {result.issues.length ? (
        <>
          <IssueList issues={result.issues} />
          <Spacer size={spacing.lg} />
        </>
      ) : null}

      {fatal ? (
        <Notice kind="error" title="This recording can’t be used">
          Fix the issue above and record again. Nothing has been saved.
        </Notice>
      ) : (
        <>
          <ReadingHero reading={reading} rmsG={result.rms} dominantHz={result.dominantHz} previousG={previous?.rmsG} units={u} />
          <Spacer size={spacing.xl} />

          <Panel label="Tags" card right={<Text variant="caption" faint>optional</Text>}>
            <TagEditor value={tags} onChange={setTags} />
          </Panel>

          {settings.showDoseModel ? (
            <>
              <Disclosure title="Dose estimate">
                <DoseModelPanel rmsG={result.rms} />
              </Disclosure>
              <Spacer size={spacing.sm} />
            </>
          ) : null}

          <View style={{ marginBottom: spacing.lg }}>
            <Disclosure title="More numbers">
              <SpectrumChart f={result.spectrum.f} psd={result.spectrum.psd} peakHz={result.dominantHz} />
              <Spacer size={spacing.md} />
              <BarStrip values={result.rmsTimeline} />
              <Spacer size={spacing.lg} />
              <MetricsTable m={{ ...result, rmsG: result.rms }} units={u} />
              <SpecRow k="Slow motion, 0–1 Hz RMS" v={`${formatAccelValue(result.lfMotionRms, u)} ${UNIT_LABEL[u]}`} />
              <SpecRow k="Sensor rate" v={`${result.measuredFsHz.toFixed(1)} Hz · jitter ${result.jitter.toFixed(3)}`} />
              <SpecRow k="Samples" v={`${recording.samples.length} · clock ${recording.timestampSource}`} />
              <SpecRow k="Analysis mode" v={result.mode === 'axes' ? 'per-axis' : 'vector magnitude'} last />
              {settings.devMode ? (
                <>
                  <Spacer size={spacing.md} />
                  <Button title="Export raw CSV (Phyphox layout, m/s²)" variant="secondary" onPress={exportRaw} loading={exporting} />
                </>
              ) : null}
            </Disclosure>
          </View>
        </>
      )}

      {fatal ? (
        <Button title="Record again" size="lg" onPress={() => router.replace({ pathname: '/record', params: { position } })} />
      ) : (
        <Button title="Save" size="lg" onPress={save} loading={saving} />
      )}
      <Button title="Discard" variant="ghost" onPress={discard} style={{ marginTop: spacing.xs }} />
      <View style={{ height: spacing.sm }} />
    </Screen>
  );
}
