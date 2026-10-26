import { router } from 'expo-router';
import React from 'react';

import { tipsByCategory } from '@/lib/tips';
import { usePersonal } from '@/state/use-personal';
import { Chevron, Disclosure, ListRow, Panel, Screen, Spacer, Text } from '@/ui/primitives';
import { TipCard } from '@/ui/tip-card';
import { spacing } from '@/ui/theme';

const GROUPS = tipsByCategory();

export default function TipsScreen() {
  const { tips } = usePersonal(8);
  const picked = new Set(tips.map((t) => t.tip.id));

  return (
    <Screen>
      <Panel label="Suggested" card={tips.length ? 'list' : true}>
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

      <Text variant="caption" faint style={{ paddingHorizontal: spacing.xs, marginTop: -spacing.lg, marginBottom: spacing.lg }}>
        Try one change at a time and compare readings. Not medical advice.
      </Text>

      <Disclosure title="All tips" subtitle={`${GROUPS.reduce((n, g) => n + g.tips.length, 0)} tips`}>
        {GROUPS.map((g) => {
          const rest = g.tips.filter((t) => !picked.has(t.id));
          if (!rest.length) return null;
          return (
            <Panel key={g.category} label={g.label} card="list">
              {rest.map((t, i) => (
                <TipCard key={t.id} tip={t} last={i === rest.length - 1} />
              ))}
            </Panel>
          );
        })}
      </Disclosure>
      <Spacer size={spacing.lg} />
    </Screen>
  );
}
