import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { guard } from '@/lib/feedback';
import type { Tip } from '@/lib/tips';
import { Button, Row, Spacer, Text } from './primitives';
import { spacing, spring, useTheme } from './theme';

/** One tip as a list row: title (and why, if personal); tap to show the details. */
export function TipCard({ tip, reason, last }: { tip: Tip; reason?: string; last?: boolean }) {
  const { colors, target, reduceMotion } = useTheme();
  const [open, setOpen] = useState(false);
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.set(reduceMotion ? (open ? 1 : 0) : withSpring(open ? 1 : 0, spring.move));
  }, [open, reduceMotion, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));
  return (
    <View style={{ borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.hairline }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={reason ? `${tip.title}. Suggested because: ${reason}` : tip.title}
        accessibilityHint={open ? 'Double tap to hide details' : 'Double tap to show details'}
        accessibilityState={{ expanded: open }}
        onPress={guard(() => setOpen((o) => !o))}
        style={({ pressed }) => [
          { minHeight: target, paddingVertical: 12, justifyContent: 'center' },
          pressed && { backgroundColor: colors.inset, marginHorizontal: -spacing.md, paddingHorizontal: spacing.md },
        ]}>
        <Row style={{ alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text variant="subheading">{tip.title}</Text>
            {reason ? (
              <Text variant="caption" faint style={{ marginTop: 2 }} numberOfLines={open ? undefined : 1}>
                {reason}
              </Text>
            ) : null}
          </View>
          <Animated.View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={chevron}>
            <Ionicons name="chevron-down" size={20} color={colors.ink3} />
          </Animated.View>
        </Row>
      </Pressable>
      {open ? (
        <View style={{ paddingBottom: spacing.md }}>
          <Text variant="caption" muted>
            {tip.body}
          </Text>
          {tip.steps?.length ? (
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              {tip.steps.map((s, i) => (
                <Row key={i} gap={spacing.sm} style={{ alignItems: 'flex-start' }} accessible accessibilityLabel={`${i + 1}. ${s}`}>
                  <Text variant="caption" faint style={{ width: 20, fontVariant: ['tabular-nums'] }}>
                    {i + 1}.
                  </Text>
                  <Text variant="caption" style={{ flex: 1 }}>
                    {s}
                  </Text>
                </Row>
              ))}
            </View>
          ) : null}
          {tip.action ? (
            <>
              <Spacer size={spacing.md} />
              <Button title={tip.action.label} variant="secondary" size="sm" onPress={() => router.push(tip.action!.href)} />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
