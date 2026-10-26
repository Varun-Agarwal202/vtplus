import { useKeepAwake } from 'expo-keep-awake';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { announce, haptic, stopSpeaking } from '@/lib/feedback';
import { Button, Screen, Segmented, Spacer, Text } from '@/ui/primitives';
import { spacing, spring, useTheme } from '@/ui/theme';

/** Slow breathing with a longer out-breath: 4 seconds in, 6 out, about 6 breaths a minute. */
const IN_S = 4;
const OUT_S = 6;
const LENGTHS = [1, 2, 3, 5];

type Phase = 'in' | 'out';

export default function BreatheScreen() {
  useKeepAwake();
  const { colors, reduceMotion } = useTheme();
  const [minutes, setMinutes] = useState(2);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase>('in');
  const [left, setLeft] = useState(0);
  const scale = useSharedValue(0.6);
  const circle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    if (!running) return;
    let phaseNow: Phase = 'in';
    let remaining = minutes * 60;
    let tick: ReturnType<typeof setTimeout>;
    const step = () => {
      const dur = phaseNow === 'in' ? IN_S : OUT_S;
      setPhase(phaseNow);
      announce(phaseNow === 'in' ? 'Breathe in' : 'Breathe out');
      haptic('tick');
      // the breath itself is timed, so this one follows the clock rather than a spring
      if (!reduceMotion) scale.set(withTiming(phaseNow === 'in' ? 1 : 0.6, { duration: dur * 1000, easing: Easing.inOut(Easing.sin) }));
      tick = setTimeout(() => {
        remaining -= dur;
        setLeft(remaining);
        if (remaining <= 0) {
          setRunning(false);
          haptic('success');
          announce('Session complete');
          return;
        }
        phaseNow = phaseNow === 'in' ? 'out' : 'in';
        step();
      }, dur * 1000);
    };
    tick = setTimeout(() => {
      setLeft(remaining);
      step();
    }, 0);
    return () => {
      clearTimeout(tick);
      cancelAnimation(scale);
      // settle back to rest from wherever the circle is
      scale.set(reduceMotion ? 0.6 : withSpring(0.6, spring.move));
      stopSpeaking();
    };
  }, [running, minutes, reduceMotion, scale]);

  const mins = Math.ceil(left / 60);
  const size = 220;

  return (
    <Screen>
      <Text muted style={{ textAlign: 'center' }}>
        Paced breathing: 4 seconds in, 6 seconds out.
      </Text>
      <Spacer size={spacing.lg} />

      <View style={{ alignItems: 'center', justifyContent: 'center', height: size + 20 }}>
        {!reduceMotion ? (
          <Animated.View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[
              {
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: colors.accent,
                opacity: 0.16,
              },
              circle,
            ]}
          />
        ) : null}
        <View accessible accessibilityLiveRegion="assertive" accessibilityLabel={running ? (phase === 'in' ? 'Breathe in' : 'Breathe out') : 'Ready'}>
          <Text variant="title" style={{ textAlign: 'center' }}>
            {running ? (phase === 'in' ? 'Breathe in…' : 'Breathe out…') : 'Ready'}
          </Text>
          {running ? (
            <Text variant="caption" faint style={{ textAlign: 'center', marginTop: spacing.xs }}>
              {phase === 'in' ? `${IN_S} seconds, through your nose` : `${OUT_S} seconds, slowly`}
            </Text>
          ) : null}
        </View>
      </View>

      <Spacer size={spacing.lg} />
      {running ? (
        <>
          <Text variant="caption" muted style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
            About {mins} minute{mins === 1 ? '' : 's'} left
          </Text>
          <Spacer size={spacing.md} />
          <Button title="Stop" variant="secondary" size="lg" onPress={() => setRunning(false)} />
        </>
      ) : (
        <>
          <Segmented<string>
            accessibilityLabel="How long"
            options={LENGTHS.map((m) => ({ value: String(m), label: `${m} min`, spoken: `${m} minute${m === 1 ? '' : 's'}` }))}
            value={String(minutes)}
            onChange={(v) => setMinutes(Number(v))}
          />
          <Spacer size={spacing.lg} />
          <Button title="Start" size="lg" onPress={() => setRunning(true)} />
        </>
      )}
    </Screen>
  );
}
