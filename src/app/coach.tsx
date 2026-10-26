import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachUnavailable, askCoach, buildCoachContext, type CoachMessage } from '@/lib/coach';
import { announce, guard, stopSpeaking } from '@/lib/feedback';
import { usePersonal } from '@/state/use-personal';
import { Chevron, ListRow, Notice, Row, Spacer, Text, usePressScale } from '@/ui/primitives';
import { spacing, useTheme } from '@/ui/theme';

/** Kept for the app session so leaving the screen doesn't lose the chat. */
let savedChat: CoachMessage[] = [];

const STARTERS = [
  'Summarize my week',
  'What affects my readings?',
  'When are my readings lowest?',
  'Prepare for a doctor visit',
];

export default function CoachScreen() {
  const { colors, textScale, target, highContrast } = useTheme();
  const insets = useSafeAreaInsets();
  const sendPress = usePressScale(0.9);
  const personal = usePersonal();
  const [messages, setMessages] = useState<CoachMessage[]>(savedChat);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const canSend = !!draft.trim() && !busy;
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    savedChat = messages;
  }, [messages]);
  useEffect(() => stopSpeaking, []);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: CoachMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setDraft('');
    setError(null);
    setBusy(true);
    try {
      const context = buildCoachContext({
        profile: personal.profile,
        sessions: personal.sessions,
        insights: personal.insights,
        recap: personal.recap,
        recentChange: personal.recentChange,
        streakDays: personal.habits.streakDays,
      });
      const reply = await askCoach(next, context);
      setMessages([...next, { role: 'assistant', content: reply }]);
      announce(reply);
    } catch (e) {
      if (e instanceof CoachUnavailable) setUnavailable(true);
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      announce(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.lg }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? (
          <View style={{ paddingVertical: spacing.md }}>
            <Text variant="title">Ask about your readings</Text>
            <Text muted style={{ marginTop: spacing.xs }}>
              Answers use your profile, readings and tags.
            </Text>
            <Spacer size={spacing.lg} />
            <Text variant="eyebrow" muted accessibilityRole="header" style={{ marginBottom: spacing.sm }}>
              Try asking
            </Text>
            <View>
              {STARTERS.map((s, i) => (
                <ListRow key={s} title={s} right={<Chevron />} onPress={() => void send(s)} last={i === STARTERS.length - 1} />
              ))}
            </View>
          </View>
        ) : (
          messages.map((m, i) => <Bubble key={i} m={m} />)
        )}

        {busy ? (
          <Row gap={spacing.sm} style={{ alignItems: 'center', marginTop: spacing.sm }} accessibilityLiveRegion="polite" accessible accessibilityLabel="Generating answer">
            <ActivityIndicator color={colors.accent} />
            <Text variant="caption" muted>
              Thinking…
            </Text>
          </Row>
        ) : null}

        {error ? (
          <View style={{ marginTop: spacing.md }}>
            <Notice kind={unavailable ? 'info' : 'error'} title={unavailable ? 'Not available' : 'Something went wrong'}>
              {error}
            </Notice>
          </View>
        ) : null}

        <Text variant="caption" faint style={{ textAlign: 'center', marginTop: spacing.lg }}>
          Your profile and recent readings are shared with the AI model to answer. Responses may be inaccurate and aren’t medical advice.
        </Text>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.sm,
          backgroundColor: colors.bg,
          borderTopWidth: highContrast ? 2 : 1,
          borderTopColor: highContrast ? colors.hairlineStrong : colors.hairline,
        }}>
        <Row gap={spacing.sm} style={{ alignItems: 'flex-end' }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask a question"
            placeholderTextColor={colors.ink3}
            accessibilityLabel="Question"
            accessibilityHint="Tip: use the microphone on your keyboard to talk instead of typing"
            multiline
            maxLength={1000}
            maxFontSizeMultiplier={2}
            style={{
              flex: 1,
              minHeight: target - 8,
              maxHeight: 140,
              backgroundColor: colors.inset,
              color: colors.ink,
              borderRadius: (target - 8) / 2,
              borderCurve: 'continuous',
              borderWidth: highContrast ? 2 : 0,
              borderColor: colors.hairlineStrong,
              paddingHorizontal: spacing.md,
              paddingTop: 12,
              paddingBottom: 12,
              fontSize: 17 * textScale,
            }}
          />
          <Animated.View style={sendPress.style}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={guard(() => void send(draft))}
              onPressIn={sendPress.onPressIn}
              onPressOut={sendPress.onPressOut}
              style={{
                width: target - 8,
                height: target - 8,
                borderRadius: (target - 8) / 2,
                backgroundColor: canSend ? colors.accent : colors.inset,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name="arrow-up" size={22} color={canSend ? colors.onAccent : colors.ink3} />
            </Pressable>
          </Animated.View>
        </Row>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m }: { m: CoachMessage }) {
  const { colors, highContrast } = useTheme();
  const mine = m.role === 'user';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: spacing.sm }}>
      <View
        accessible
        accessibilityLabel={`${mine ? 'You' : 'Answer'}: ${m.content}`}
        style={{
          maxWidth: '88%',
          backgroundColor: mine ? colors.accent : colors.surface,
          borderRadius: 18,
          borderCurve: 'continuous',
          borderWidth: highContrast ? 2 : 0,
          borderColor: highContrast ? colors.hairlineStrong : colors.hairline,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
        }}>
        <Text color={mine ? colors.onAccent : colors.ink}>{m.content}</Text>
      </View>
      {!mine ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Read this answer aloud"
          hitSlop={8}
          onPress={guard(() => {
            Speech.stop();
            Speech.speak(m.content, { rate: 0.92 });
          })}
          style={{ paddingVertical: 6, paddingHorizontal: 4 }}>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <Ionicons name="volume-medium-outline" size={16} color={colors.accent} />
            <Text variant="caption" color={colors.accent}>
              Read aloud
            </Text>
          </Row>
        </Pressable>
      ) : null}
    </View>
  );
}
