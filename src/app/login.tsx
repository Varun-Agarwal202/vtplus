import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';

import { useAuth } from '@/state/auth-context';
import { Box, Button, Row, Rule, Screen, Spacer, Text } from '@/ui/primitives';
import { radius, spacing, useTheme } from '@/ui/theme';

export default function LoginScreen() {
  const { configured, signIn, signUp, signInWithGoogle } = useAuth();
  const { colors, textScale, target, highContrast } = useTheme();
  const inputStyle = {
    borderWidth: highContrast ? 2 : 0,
    borderRadius: radius.md,
    borderCurve: 'continuous' as const,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 17 * textScale,
    minHeight: target,
    backgroundColor: colors.inset,
  };
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setMessage(null);
    if (!email.trim() || password.length < 6) {
      setError('Use your email and a password of at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signIn') {
        const { error: err } = await signIn(email, password);
        if (err) setError(err);
      } else {
        const { error: err, needsEmailConfirm } = await signUp(email, password);
        if (err) setError(err);
        else if (needsEmailConfirm) setMessage('Check your email for a confirmation link, then sign in.');
        else setMessage('Account created. You’re signed in.');
      }
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    setMessage(null);
    setGoogleBusy(true);
    try {
      const { error: err } = await signInWithGoogle();
      if (err) setError(err);
    } finally {
      setGoogleBusy(false);
    }
  };

  if (!configured) {
    return (
      <Screen safeTop>
        <Spacer size={spacing.xxl} />
        <Text variant="display">Sign-in not set up</Text>
        <Spacer size={spacing.md} />
        <Text muted>
          Add a Supabase project and put{' '}
          <Text variant="caption">EXPO_PUBLIC_SUPABASE_URL</Text> and{' '}
          <Text variant="caption">EXPO_PUBLIC_SUPABASE_ANON_KEY</Text> in a <Text variant="caption">.env</Text> file, then run the SQL in{' '}
          <Text variant="caption">supabase/schema.sql</Text>. Restart Expo after changing env vars.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen safeTop>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Spacer size={spacing.xxl} />
        <Text variant="display">{mode === 'signIn' ? 'Sign in' : 'Create account'}</Text>
        <Text muted style={{ marginTop: spacing.xs }}>
          Tremor Tracker
        </Text>
        <Spacer size={spacing.xl} />

        <Button title="Continue with Google" variant="secondary" onPress={google} loading={googleBusy} disabled={busy} />
        <Row gap={spacing.md} style={{ alignItems: 'center', marginVertical: spacing.lg }}>
          <Rule style={{ flex: 1 }} />
          <Text variant="caption" faint>
            or
          </Text>
          <Rule style={{ flex: 1 }} />
        </Row>

        <Box>
          <Field label="Email">
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
              placeholderTextColor={colors.ink3}
              accessibilityLabel="Email"
              autoComplete="email"
              maxFontSizeMultiplier={2}
              style={[inputStyle, { color: colors.ink, borderColor: colors.hairlineStrong }]}
            />
          </Field>
          <Field label="Password" last>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.ink3}
              accessibilityLabel="Password"
              accessibilityHint="At least 6 characters"
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              maxFontSizeMultiplier={2}
              style={[inputStyle, { color: colors.ink, borderColor: colors.hairlineStrong }]}
            />
          </Field>
        </Box>

        {error ? (
          <>
            <Spacer size={spacing.md} />
            <Text variant="caption" style={{ color: colors.signal }} accessibilityRole="alert" accessibilityLiveRegion="assertive">
              {error}
            </Text>
          </>
        ) : null}
        {message ? (
          <>
            <Spacer size={spacing.md} />
            <Text variant="caption" muted accessibilityLiveRegion="polite">
              {message}
            </Text>
          </>
        ) : null}

        <Spacer size={spacing.lg} />
        <Button title={mode === 'signIn' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} disabled={googleBusy} />
        <Spacer size={spacing.sm} />
        <Button
          title={mode === 'signIn' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          variant="secondary"
          onPress={() => {
            setMode(mode === 'signIn' ? 'signUp' : 'signIn');
            setError(null);
            setMessage(null);
          }}
        />
        <Spacer size={spacing.lg} />
        <Button
          title="Accessibility & display"
          variant="ghost"
          accessibilityHint="Text size, dark mode, bigger buttons and more. Works before signing in."
          onPress={() => router.push('/accessibility')}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
function Field({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={{ marginBottom: last ? 0 : spacing.lg }}>
      <Text variant="eyebrow" muted style={{ marginBottom: spacing.sm }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
