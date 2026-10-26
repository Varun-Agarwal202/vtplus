import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, View, type AppStateStatus } from 'react-native';
import { Easing, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { POSITION_LABEL, POSITION_SHORT, type Position } from '@/db/types';
import { MIN_RAW_S, analyze, liveEstimate } from '@/dsp';
import type { Sample } from '@/dsp/types';
import { announce, haptic, stopSpeaking } from '@/lib/feedback';
import { Recorder, type Recording } from '@/sensors/recorder';
import { setPendingRecording } from '@/state/pending-recording';
import { useSettings } from '@/state/settings-context';
import { LiveRing, LiveWaveform } from '@/ui/charts';
import { Button, Dot, Row, Text } from '@/ui/primitives';
import { spacing, spring, useTheme } from '@/ui/theme';

type Phase = 'countdown' | 'recording' | 'analyzing';

const COUNTDOWN_S = 3;
const WAVE_POINTS = 180;

export default function RecordScreen() {
  useKeepAwake();
  const { position: positionParam } = useLocalSearchParams<{ position?: string }>();
  const position: Position = positionParam === 'postural' || positionParam === 'kinetic' ? positionParam : 'rest';
  const { settings } = useSettings();
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const durationS = settings.durationS;
  const spokenRef = useRef(new Set<string>());

  const [phase, setPhase] = useState<Phase>('countdown');
  const [count, setCount] = useState(COUNTDOWN_S);
  // whole seconds only: the screen re-renders once a second, never per frame
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const wholeRef = useRef(0);
  const [live, setLive] = useState<{ hz: number | null; fs: number }>({ hz: null, fs: 0 });
  // drawn on the UI thread
  const ring = useSharedValue(0);
  const wave = useSharedValue<number[]>([]);

  const recorderRef = useRef<Recorder | null>(null);
  const magRef = useRef<number[]>([]);
  const recentRef = useRef<Sample[]>([]);
  const finishedRef = useRef(false);

  const leave = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if ((state === 'background' || state === 'inactive') && !finishedRef.current) {
        recorderRef.current?.cancel();
        recorderRef.current = null;
        finishedRef.current = true;
        Alert.alert('Recording cancelled', 'The app was interrupted, so this recording was discarded.', [
          { text: 'OK', onPress: () => (router.canGoBack() ? router.back() : router.replace('/')) },
        ]);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (phase !== 'countdown' || count !== COUNTDOWN_S) return;
    ring.set(0);
    ring.set(withTiming(1, { duration: COUNTDOWN_S * 1000, easing: Easing.linear }));
  }, [phase, count, ring]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    haptic('tick');
    announce(count === COUNTDOWN_S ? `Get into the ${POSITION_LABEL[position].toLowerCase()} position. ${count}` : String(count));
    const id = setTimeout(() => {
      if (count <= 1) setPhase('recording');
      else setCount((c) => c - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [phase, count, position]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const say = (key: string, text: string) => {
      if (spokenRef.current.has(key)) return;
      spokenRef.current.add(key);
      announce(text);
    };
    const left = durationS - elapsed;
    if (elapsed < 0.5) {
      haptic('start');
      say('start', `Recording. Hold still for ${durationS} seconds.`);
    } else if (durationS >= 20 && elapsed >= durationS / 2 && left > 10) say('half', 'Halfway.');
    else if (durationS > 10 && left <= 10 && left > 5) say('ten', '10 seconds left.');
  }, [phase, elapsed, durationS]);

  useEffect(() => stopSpeaking, []);

  const onComplete = useCallback(
    (rec: Recording) => {
      finishedRef.current = true;
      setPhase('analyzing');
      ring.set(reduceMotion ? 1 : withSpring(1, spring.move));
      haptic('success');
      announce('Recording complete. Analyzing.');
      setTimeout(() => {
        try {
          const result = analyze(rec.samples, { mode: settings.analysisMode });
          setPendingRecording({ recording: rec, position, result });
          router.replace('/result');
        } catch (e) {
          Alert.alert('Analysis failed', e instanceof Error ? e.message : String(e), [{ text: 'OK', onPress: leave }]);
        }
      }, 30);
    },
    [leave, position, settings.analysisMode, ring, reduceMotion],
  );

  useEffect(() => {
    if (phase !== 'recording') return;
    ring.set(0);
    const devMode = settings.devMode;
    const rec = new Recorder(
      { durationS, intervalMs: 10 },
      {
        onSample: (s, i) => {
          const m = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
          const mags = magRef.current;
          mags.push(m);
          if (mags.length > WAVE_POINTS) mags.splice(0, mags.length - WAVE_POINTS);
          // hand the trace to the UI thread every 4th sample (~25 times a second at 100 Hz)
          if (i % 4 === 0) wave.set(mags.slice());
          const recent = recentRef.current;
          recent.push(s);
          if (recent.length > 400) recent.splice(0, recent.length - 400);
        },
        onProgress: (t) => {
          elapsedRef.current = t;
          // glide to just ahead of the true elapsed time; each update retargets from the current arc
          ring.set(withTiming(Math.min(1, (t + 0.1) / durationS), { duration: 100, easing: Easing.linear }));
          const whole = Math.floor(t);
          if (whole === wholeRef.current) return;
          wholeRef.current = whole;
          setElapsed(whole);
          if (devMode) {
            const recent = recentRef.current;
            const cut = recent.length ? recent[recent.length - 1].t - 2 : 0;
            const e = liveEstimate(recent.filter((x) => x.t >= cut));
            setLive({ hz: e.dominantHz, fs: e.measuredFsHz });
          }
        },
        onComplete,
        onError: (err) => {
          finishedRef.current = true;
          Alert.alert('Sensor error', err.message, [{ text: 'OK', onPress: leave }]);
        },
      },
    );
    recorderRef.current = rec;
    rec.start().catch((e) => {
      finishedRef.current = true;
      Alert.alert('Could not start', e instanceof Error ? e.message : String(e), [{ text: 'OK', onPress: leave }]);
    });

    return () => {
      rec.cancel();
    };
  }, [phase, durationS, onComplete, leave, ring, wave, settings.devMode]);

  const discard = () => {
    Alert.alert('Throw this one away?', 'Nothing will be saved.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          finishedRef.current = true;
          leave();
        },
      },
    ]);
  };

  const finishNow = () => {
    if (elapsedRef.current < MIN_RAW_S) return;
    recorderRef.current?.stopEarly();
  };

  const remaining = Math.max(0, Math.ceil(durationS - elapsed));
  const canFinish = phase === 'recording' && elapsed >= MIN_RAW_S;
  const needMore = Math.max(0, Math.ceil(MIN_RAW_S - elapsed));

  const status = phase === 'countdown' ? 'Get ready' : phase === 'recording' ? 'Recording' : 'Analyzing';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }}>
      <View style={{ alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
        <Text variant="subheading">{POSITION_LABEL[position]}</Text>
        <Row gap={spacing.sm} style={{ alignItems: 'center', marginTop: 2 }}>
          {phase === 'recording' ? <Dot /> : null}
          <Text variant="caption" faint>
            {status}
          </Text>
        </Row>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
        <View
          accessible
          accessibilityLiveRegion={phase === 'countdown' ? 'assertive' : 'none'}
          accessibilityLabel={
            phase === 'countdown' ? `Starting in ${count}` : phase === 'analyzing' ? 'Working out your reading' : `Recording. ${remaining} seconds left`
          }>
          <LiveRing progress={ring} size={240} color={phase === 'countdown' ? colors.accent : colors.signal}>
            <View style={{ alignItems: 'center' }}>
              <Text variant="readoutLarge">{phase === 'countdown' ? count : phase === 'analyzing' ? '…' : remaining}</Text>
              <Text variant="caption" faint>
                {phase === 'countdown' ? 'Starting' : phase === 'analyzing' ? 'Almost done' : 'Seconds left'}
              </Text>
            </View>
          </LiveRing>
        </View>
        <View style={{ alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xl }}>
          <Text muted style={{ textAlign: 'center' }}>
            {phase === 'countdown' ? POSITION_SHORT[position] : phase === 'analyzing' ? 'Working it out…' : 'Hold still'}
          </Text>
          {settings.devMode && phase === 'recording' ? (
            <Text variant="monoSmall" faint>
              {live.hz !== null ? `${live.hz.toFixed(1)} Hz · ` : ''}sensor ≈ {live.fs ? live.fs.toFixed(0) : '–'} Hz
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.md }}>
        {reduceMotion || phase !== 'recording' ? null : <LiveWaveform values={wave} height={56} color={colors.ink3} />}
        <View style={{ height: spacing.md }} />
        {phase === 'recording' ? (
          <>
            <Button title="Finish" onPress={finishNow} disabled={!canFinish} />
            <Text
              variant="caption"
              faint
              accessibilityElementsHidden={canFinish}
              importantForAccessibility={canFinish ? 'no-hide-descendants' : 'auto'}
              style={{ textAlign: 'center', marginTop: spacing.sm, opacity: canFinish ? 0 : 1 }}>
              Can finish in {needMore}s
            </Text>
            <View style={{ height: spacing.sm }} />
            <Button title="Discard" variant="ghost" onPress={discard} accessibilityHint="Throws this recording away" />
          </>
        ) : phase === 'countdown' ? (
          <Button title="Cancel" variant="ghost" onPress={discard} />
        ) : null}
      </View>
    </View>
  );
}
