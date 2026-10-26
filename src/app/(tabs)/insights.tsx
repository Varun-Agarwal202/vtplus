import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CONFIDENCE_NOTE, type FactorId, type Insight } from '@/lib/insights';
import { TRIGGER_LABEL, type Trigger } from '@/lib/profile';
import { usePersonal } from '@/state/use-personal';
import { Chevron, ListRow, Panel, Row, Screen, Spacer, SpecStrip, Text } from '@/ui/primitives';
import { TipCard } from '@/ui/tip-card';
import { spacing, useTheme } from '@/ui/theme';

const CONFIDENCE_SHORT = { early: 'Early', some: 'Forming', good: 'Consistent' } as const;
const DAY_PART_WORD = { morning: 'Mornings', afternoon: 'Afternoons', evening: 'Evenings', night: 'Nights' } as const;
const TRIGGER_FACTOR: Partial<Record<Trigger, FactorId>> = { caffeine: 'caffeine', stress: 'stress', sleep: 'sleep' };

export default function InsightsScreen() {
  const { colors } = useTheme();
  const { loading, insights, habits, recap, tips, profile } = usePersonal(5);

  const real = insights.filter((i) => i.direction !== 'same');
  // things the user suspected that their data doesn't (yet) back up
  const myths = profile.triggers
    .map((t) => ({ t, ins: TRIGGER_FACTOR[t] ? insights.find((i) => i.factor === TRIGGER_FACTOR[t] && i.direction === 'same') : undefined }))
    .filter((x): x is { t: Trigger; ins: Insight } => !!x.ins);

  const weekChange =
    recap.change === null ? '–' : Math.abs(recap.change) < 0.08 ? 'Same' : `${recap.change < 0 ? '↓' : '↑'}${Math.round(Math.abs(recap.change) * 100)}%`;

  return (
    <Screen safeTop>
      <Text variant="display" style={{ marginTop: spacing.sm }}>
        Insights
      </Text>
      <Spacer size={spacing.lg} />

      <Panel label="This week">
        <SpecStrip
          items={[
            { label: 'Readings', value: String(recap.count) },
            { label: 'Vs last wk', value: weekChange },
            { label: 'Streak', value: String(habits.streakDays), unit: habits.streakDays === 1 ? 'day' : 'days' },
          ]}
        />
        {recap.steadiestPart ? (
          <Text variant="caption" muted style={{ marginTop: spacing.sm, paddingHorizontal: spacing.xs }}>
            Lowest readings: {DAY_PART_WORD[recap.steadiestPart].toLowerCase()}
          </Text>
        ) : null}
      </Panel>

      <Panel label="Patterns" card={real.length || myths.length ? 'list' : true}>
        {loading ? (
          <Text muted>Loading…</Text>
        ) : real.length === 0 && myths.length === 0 ? (
          <Text muted>Add sleep, stress, caffeine and medication tags to your readings to see patterns.</Text>
        ) : (
          <>
            {real.map((ins, i) => (
              <InsightRow key={ins.factor} insight={ins} last={i === real.length - 1 && myths.length === 0} />
            ))}
            {myths.map(({ t, ins }, i) => (
              <View
                key={t}
                accessible
                accessibilityLabel={`${TRIGGER_LABEL[t]}: listed as a possible trigger. ${ins.sentence}`}
                style={{ paddingVertical: 12, borderBottomWidth: i === myths.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.hairline }}>
                <Text variant="subheading">{TRIGGER_LABEL[t]}</Text>
                <Text variant="caption" muted>
                  Listed as a trigger · no clear difference yet
                </Text>
              </View>
            ))}
          </>
        )}
      </Panel>

      <Panel label="Suggested" card={tips.length ? 'list' : true} onSeeAll={tips.length ? () => router.push('/tips') : undefined}>
        {tips.length ? (
          tips.map((r, i) => <TipCard key={r.tip.id} tip={r.tip} reason={r.reason} last={i === tips.length - 1} />)
        ) : (
          <ListRow
            title="Complete your profile or tag readings to get suggestions."
            right={<Chevron />}
            onPress={() => router.push('/profile')}
            last
          />
        )}
      </Panel>

      <Panel label="More" card="list" style={{ marginBottom: 0 }}>
        <ListRow
          left={<Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.accent} />}
          title="Ask AI"
          subtitle="Questions about your readings and patterns"
          accessibilityLabel="Ask AI about your readings"
          right={<Chevron />}
          onPress={() => router.push('/coach')}
        />
        <ListRow
          left={<Ionicons name="leaf-outline" size={22} color={colors.accent} />}
          title="Breathing exercise"
          right={<Chevron />}
          onPress={() => router.push('/breathe')}
        />
        <ListRow
          left={<Ionicons name="library-outline" size={22} color={colors.accent} />}
          title="All tips"
          right={<Chevron />}
          onPress={() => router.push('/tips')}
          last
        />
      </Panel>
    </Screen>
  );
}

function InsightRow({ insight, last }: { insight: Insight; last: boolean }) {
  const { colors, target } = useTheme();
  // rel is relative to the second group; show how much higher the higher group was
  const pct = Math.round((insight.rel >= 0 ? insight.rel : 1 / (1 + insight.rel) - 1) * 100);
  return (
    <View
      accessible
      accessibilityLabel={`${insight.title}: ${insight.sentence} ${CONFIDENCE_NOTE[insight.confidence]}`}
      style={{ minHeight: target, paddingVertical: 12, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.hairline }}>
      <Row style={{ alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{insight.title}</Text>
          <Text variant="caption" muted>
            Higher {insight.higherGroup}
          </Text>
          <Text variant="caption" faint>
            {CONFIDENCE_SHORT[insight.confidence]} · {insight.counts[0] + insight.counts[1]} readings
          </Text>
        </View>
        <Text variant="title" style={{ fontVariant: ['tabular-nums'] }}>
          +{pct}%
        </Text>
      </Row>
    </View>
  );
}
