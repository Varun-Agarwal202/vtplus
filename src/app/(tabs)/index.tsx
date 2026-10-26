import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useRepository } from '@/data/repository-context';
import { POSITION_HELP, POSITION_LABEL, POSITION_SHORT, POSITIONS, type Position, type Session } from '@/db/types';
import { formatDateTime } from '@/lib/format';
import { guard } from '@/lib/feedback';
import { changeFor, levelFor } from '@/lib/interpret';
import { greeting, relPhrase } from '@/lib/personal';
import { useSettings } from '@/state/settings-context';
import { usePersonal } from '@/state/use-personal';
import { Avatar, Box, Chevron, ListRow, Panel, Row, Screen, Segmented, Spacer, Text, usePressScale } from '@/ui/primitives';
import { spacing, useTheme } from '@/ui/theme';

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

/** The round record button. Springs down the instant it's touched. */
function StartButton({ seconds, position }: { seconds: number; position: Position }) {
  const { colors, textScale, largeTargets, highContrast } = useTheme();
  const press = usePressScale(0.95);
  const size = Math.round((largeTargets ? 160 : 144) * Math.min(textScale, 1.4));
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Start a ${seconds} second ${POSITION_LABEL[position].toLowerCase()} reading`}
        accessibilityHint={POSITION_HELP[position]}
        onPress={guard(() => router.push({ pathname: '/record', params: { position } }))}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.signal,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: highContrast ? 3 : 0,
          borderColor: colors.ink,
        }}>
        <RNText maxFontSizeMultiplier={1.4} style={{ fontSize: 22 * Math.min(textScale, 1.4), fontWeight: '600', letterSpacing: -0.2, color: colors.onSignal }}>
          Start
        </RNText>
        <RNText
          maxFontSizeMultiplier={1.4}
          style={{ fontSize: 15 * Math.min(textScale, 1.4), fontVariant: ['tabular-nums'], color: colors.onSignal, marginTop: 2, opacity: 0.9 }}>
          {seconds} s
        </RNText>
      </Pressable>
    </Animated.View>
  );
}

function PositionGuide({ position }: { position: Position }) {
  const { colors } = useTheme();
  const guide =
    position === 'rest'
      ? { icon: 'hand-left-outline' as const, title: 'Support your arm', detail: 'Rest your forearm and let the phone sit loosely in your open palm.' }
      : position === 'postural'
        ? { icon: 'arrow-up-outline' as const, title: 'Hold a steady posture', detail: 'Extend your arm comfortably, palm up, with the phone resting in your hand.' }
        : { icon: 'walk-outline' as const, title: 'Move at a comfortable pace', detail: 'Keep the phone secure in your hand and move naturally for the full reading.' };

  return (
    <View
      accessible
      accessibilityLabel={`${guide.title}. ${guide.detail}`}
      style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.md, backgroundColor: colors.accentSoft, borderRadius: 14, marginTop: spacing.md }}>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={guide.icon} size={23} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="subheading">{guide.title}</Text>
        <Text variant="caption" muted style={{ marginTop: 2 }}>
          {guide.detail}
        </Text>
      </View>
    </View>
  );
}

export default function MeasureScreen() {
  const { settings } = useSettings();
  const { colors } = useTheme();
  const repo = useRepository();
  const personal = usePersonal(1);
  const [position, setPosition] = useState<Position>(settings.defaultPosition);
  const [recent, setRecent] = useState<Session[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      repo
        .listSessions({ position, analysisMode: settings.analysisMode, limit: 2 })
        .then((rows) => alive && setRecent(rows))
        .catch(() => alive && setRecent([]));
      return () => {
        alive = false;
      };
    }, [repo, position, settings.analysisMode]),
  );

  const last = recent[0] ?? null;
  const before = recent[1] ?? null;
  const lastChange = useMemo(
    () => (last && before ? changeFor(last.rmsG, before.rmsG, POSITION_LABEL[position].toLowerCase()) : null),
    [last, before, position],
  );
  const changeText = lastChange ? (lastChange.direction === 'same' ? 'Same as before' : `${lastChange.short} than before`) : null;

  const measuredToday = !!personal.latest && isToday(personal.latest.session.startedAt);
  const today = measuredToday && personal.latest ? relPhrase(personal.latest.rel) : null;
  const subline = today
    ? `Today’s reading: ${today.charAt(0).toLowerCase()}${today.slice(1)}`
    : personal.habits.streakDays > 1
      ? `${personal.habits.streakDays}-day streak`
      : personal.sessions.length
        ? 'No reading yet today'
        : 'No readings yet';
  const topTip = personal.tips[0];
  const positionWord = POSITION_LABEL[position].toLowerCase();

  return (
    <Screen safeTop>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.sm, gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="display">{greeting(personal.name)}</Text>
          <Text muted style={{ marginTop: spacing.xs }}>
            {subline}
          </Text>
        </View>
        <Avatar name={personal.name} onPress={() => router.push('/profile')} />
      </Row>
      <Spacer size={spacing.lg} />

      <Box style={{ marginBottom: spacing.xl }}>
        <Text variant="eyebrow" faint style={{ marginBottom: spacing.sm }}>
          Measurement position
        </Text>
        <Segmented
          accessibilityLabel="Position"
          options={POSITIONS.map((p) => ({ value: p, label: POSITION_LABEL[p], hint: POSITION_HELP[p] }))}
          value={position}
          onChange={setPosition}
        />
        <Text variant="caption" faint style={{ textAlign: 'center', marginTop: spacing.sm }} accessibilityHint={POSITION_HELP[position]}>
          {POSITION_SHORT[position]}
        </Text>
        <PositionGuide position={position} />
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
          <StartButton seconds={settings.durationS} position={position} />
        </View>
        {last ? (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline }}>
            <ListRow
              title={<Text>Last {positionWord} reading</Text>}
              subtitle={`${levelFor(last.rmsG).label} · ${last.dominantHz.toFixed(1)}/s · ${formatDateTime(last.startedAt)}`}
              accessibilityLabel={`Last ${positionWord} reading, ${formatDateTime(last.startedAt)}: ${levelFor(last.rmsG).label}, ${last.dominantHz.toFixed(1)} times a second.${changeText ? ` ${changeText}.` : ''}`}
              accessibilityHint="Opens this reading"
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {changeText ? (
                    <Text variant="caption" faint>
                      {changeText}
                    </Text>
                  ) : null}
                  <Chevron />
                </View>
              }
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: last.id } })}
              last
            />
          </View>
        ) : null}
      </Box>

      {!personal.profile.onboarded ? (
        <Panel card="list">
          <ListRow
            title="Complete your profile"
            subtitle="Used to tailor suggestions"
            accessibilityHint="Used to tailor tip suggestions"
            right={<Chevron />}
            onPress={() => router.push('/profile')}
            last
          />
        </Panel>
      ) : null}

      {topTip ? (
        <Panel label="Suggested" card="list" onSeeAll={() => router.push('/tips')} seeAllLabel="All tips">
          <ListRow
            title={topTip.tip.title}
            subtitle={topTip.reason}
            accessibilityLabel={`Suggested: ${topTip.tip.title}. ${topTip.reason}`}
            accessibilityHint="Opens tips"
            right={<Chevron />}
            onPress={() => router.push('/tips')}
            last
          />
        </Panel>
      ) : null}

      <Panel label="More" card="list" style={{ marginBottom: 0 }}>
        <ListRow
          left={<Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.accent} />}
          title="Ask AI"
          accessibilityHint="Ask questions about your readings"
          right={<Chevron />}
          onPress={() => router.push('/coach')}
        />
        <ListRow
          left={<Ionicons name="leaf-outline" size={22} color={colors.accent} />}
          title="Breathing exercise"
          accessibilityHint="A short calm-breathing exercise"
          right={<Chevron />}
          onPress={() => router.push('/breathe')}
        />
        <ListRow
          left={<Ionicons name="bulb-outline" size={22} color={colors.accent} />}
          title="Tips"
          accessibilityHint="Suggestions based on your readings and profile"
          right={<Chevron />}
          onPress={() => router.push('/tips')}
          last
        />
      </Panel>
    </Screen>
  );
}
