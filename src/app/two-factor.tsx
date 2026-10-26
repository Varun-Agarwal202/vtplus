import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Share, TextInput, View } from 'react-native';

import { announce, haptic } from '@/lib/feedback';
import { cancelEnrollment, disableMfa, formatRecoveryCode, generateRecoveryCodes, normalizeCode, startEnrollment, verifiedFactorId, verifyCode, verifyRecoveryCode, type Enrollment } from '@/lib/mfa';
import { useAuth } from '@/state/auth-context';
import { Box, Button, Row, Screen, Spacer, Text } from '@/ui/primitives';
import { radius, spacing, useTheme } from '@/ui/theme';

/**
 * Two-step sign-in. Opened from Settings to turn it on. After sign-in it
 * only appears if two-step is already on and a code is still needed.
 */
export default function TwoFactorScreen() {
  const { mfa, mfaEnabled, user, signOut } = useAuth();
  const [holding, setHolding] = useState(false);
  const gated = mfa === 'verify';
  return (
    <Screen safeTop={gated}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {gated ? <Spacer size={spacing.xxl} /> : <Spacer size={spacing.md} />}
        {gated ? <Verify /> : mfaEnabled && !holding ? <Manage /> : <Enroll onHold={setHolding} />}
        {gated ? (
          <>
            <Spacer size={spacing.xl} />
            <Text variant="caption" faint style={{ textAlign: 'center' }}>
              {user?.email}
            </Text>
            <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
            <Button
              title="Accessibility & display"
              variant="ghost"
              accessibilityHint="Text size, dark mode, bigger buttons and more."
              onPress={() => router.push('/accessibility')}
            />
          </>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

/* ---------- signing in: type the code ---------- */

function Verify() {
  const { refreshMfa } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    verifiedFactorId()
      .then(setFactorId)
      .catch(() => setError('Couldn’t reach the sign-in service. Check your connection.'));
  }, []);

  const submit = useCallback(
    async (code: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = backup ? await verifyRecoveryCode(code) : factorId ? await verifyCode(factorId, code) : { error: 'No authenticator found.' };
        if (res.error) {
          setError(res.error);
          announce(res.error);
          haptic('warning');
          return;
        }
        haptic('success');
        await refreshMfa();
      } finally {
        setBusy(false);
      }
    },
    [busy, backup, factorId, refreshMfa],
  );

  return (
    <>
      <Text variant="display">{backup ? 'Backup code' : 'Enter your code'}</Text>
      <Text muted style={{ marginTop: spacing.xs }}>
        {backup ? 'One of the codes you saved when you set up two-step sign-in. Each works once.' : 'Open your authenticator app and type the six-digit code for Tremor Tracker.'}
      </Text>
      <Spacer size={spacing.xl} />
      {backup ? <RecoveryInput onSubmit={submit} busy={busy} /> : <CodeInput onComplete={submit} busy={busy} disabled={!factorId} />}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Spacer size={spacing.lg} />
      <Button
        title={backup ? 'Use my authenticator instead' : 'Lost your authenticator? Use a backup code'}
        variant="ghost"
        onPress={() => {
          setBackup((b) => !b);
          setError(null);
        }}
      />
    </>
  );
}

/* ---------- settings: already on ---------- */

function Manage() {
  const { colors } = useTheme();
  const { refreshMfa } = useAuth();
  const [busy, setBusy] = useState(false);

  const turnOff = () =>
    Alert.alert('Turn off two-step sign-in?', 'You’ll only need your password (or Google) the next time you sign in.', [
      { text: 'Keep it on', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const { error } = await disableMfa();
          setBusy(false);
          if (error) {
            Alert.alert('Couldn’t turn it off', error);
            return;
          }
          announce('Two-step sign-in is off');
          await refreshMfa();
          if (router.canGoBack()) router.back();
        },
      },
    ]);

  return (
    <>
      <Text>Two-step is on. Each time you sign in you’ll also type a six-digit code from your authenticator app.</Text>
      <Spacer size={spacing.xl} />
      <Button title="Turn off" variant="danger" onPress={turnOff} loading={busy} icon={<Ionicons name="shield-outline" size={20} color={colors.signal} />} />
    </>
  );
}

/* ---------- settings: turn it on ---------- */

type EnrollStage = 'intro' | 'loading' | 'setup' | 'codes';

function Enroll({ onHold }: { onHold: (v: boolean) => void }) {
  const { colors } = useTheme();
  const { user, refreshMfa } = useAuth();
  const [stage, setStage] = useState<EnrollStage>('intro');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = user?.email?.trim() ?? '';
  const finished = useRef(false);

  useEffect(() => {
    return () => {
      if (!finished.current) void cancelEnrollment();
    };
  }, []);

  const leave = useCallback(async () => {
    onHold(false);
    if (!finished.current) await cancelEnrollment();
    await refreshMfa();
    if (router.canGoBack()) router.back();
  }, [onHold, refreshMfa]);

  const start = useCallback(async () => {
    if (!email) {
      setError('This account needs an email before two-step can be turned on.');
      return;
    }
    onHold(true);
    setStage('loading');
    setError(null);
    const { data, error: err } = await startEnrollment();
    if (err || !data) {
      onHold(false);
      setError(err ?? 'Could not start setup.');
      setStage('intro');
      return;
    }
    setEnrollment(data);
    setStage('setup');
  }, [email, onHold]);

  const openAuthenticator = async () => {
    if (!enrollment) return;
    try {
      await Linking.openURL(enrollment.uri);
    } catch {
      setError('No authenticator app answered. Install one (Google Authenticator, Microsoft Authenticator, Authy or 1Password), or enter the key by hand.');
    }
  };

  const confirm = useCallback(
    async (code: string) => {
      if (!enrollment || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await verifyCode(enrollment.factorId, code);
        if (res.error) {
          setError(res.error);
          announce(res.error);
          haptic('warning');
          return;
        }
        haptic('success');
        announce('Two-step sign-in is on');
        finished.current = true;
        const backup = await generateRecoveryCodes();
        if (backup && backup.length) {
          setCodes(backup);
          setStage('codes');
        } else {
          await refreshMfa();
          if (router.canGoBack()) router.back();
        }
      } finally {
        setBusy(false);
      }
    },
    [enrollment, busy, refreshMfa],
  );

  const saveCodes = async () => {
    if (!codes) return;
    await Share.share({ title: 'Tremor Tracker backup codes', message: `Tremor Tracker backup codes (each works once):\n\n${codes.map(formatRecoveryCode).join('\n')}` });
  };

  const done = async () => {
    await refreshMfa();
    if (router.canGoBack()) router.back();
  };

  if (stage === 'codes' && codes) {
    return (
      <>
        <Text variant="subheading">Save your backup codes</Text>
        <Text muted style={{ marginTop: spacing.xs }}>
          If you lose your authenticator, one of these gets you in. Each works once, and they are only shown now.
        </Text>
        <Spacer size={spacing.xl} />
        <Box>
          {codes.map((c, i) => (
            <Text key={c} variant="mono" selectable style={{ paddingVertical: 6, textAlign: 'center', fontSize: 20, lineHeight: 26 }} accessibilityLabel={`Code ${i + 1}: ${formatRecoveryCode(c).split('').join(' ')}`}>
              {formatRecoveryCode(c)}
            </Text>
          ))}
        </Box>
        <Spacer size={spacing.lg} />
        <Button title="Save codes" variant="secondary" icon={<Ionicons name="share-outline" size={20} color={colors.ink} />} onPress={() => void saveCodes()} />
        <Spacer size={spacing.sm} />
        <Button title="I’ve saved them" onPress={() => void done()} />
      </>
    );
  }

  if (stage === 'intro' || stage === 'loading') {
    return (
      <>
        <Text muted>
          Optional. After you turn this on, each sign-in also needs a six-digit code from an authenticator app. You can turn it off later in Settings.
        </Text>
        <Spacer size={spacing.xl} />
        {error ? (
          <>
            <ErrorText>{error}</ErrorText>
            <Spacer size={spacing.md} />
          </>
        ) : null}
        <Button title="Turn on" onPress={() => void start()} loading={stage === 'loading'} disabled={!email || stage === 'loading'} />
        <Button title="Not now" variant="ghost" onPress={() => void leave()} />
        {!email ? (
          <Text variant="caption" muted style={{ marginTop: spacing.md }}>
            This account needs an email before two-step can be turned on.
          </Text>
        ) : null}
      </>
    );
  }

  if (!enrollment) return null;

  return (
    <>
      <Text muted>Add Tremor Tracker to your authenticator, then type the six-digit code it shows.</Text>
      <Spacer size={spacing.xl} />
      <Step n={1} title="Add Tremor Tracker to your authenticator">
        <Button title="Open authenticator app" variant="secondary" icon={<Ionicons name="key-outline" size={20} color={colors.ink} />} onPress={() => void openAuthenticator()} />
        <Spacer size={spacing.md} />
        <Text variant="caption" muted>
          Or add it by hand with this key:
        </Text>
        <Text variant="mono" selectable style={{ marginTop: spacing.xs, fontSize: 19, lineHeight: 26 }} accessibilityLabel={`Key: ${enrollment.secret.split('').join(' ')}`}>
          {enrollment.secret.match(/.{1,4}/g)?.join(' ') ?? enrollment.secret}
        </Text>
      </Step>
      <Spacer size={spacing.lg} />
      <Step n={2} title="Type the code it shows">
        <CodeInput onComplete={confirm} busy={busy} />
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Step>
      <Spacer size={spacing.lg} />
      <Button title="Cancel" variant="ghost" onPress={() => void leave()} />
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Box>
      <Row gap={spacing.sm} style={{ alignItems: 'center', marginBottom: spacing.md }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no" accessibilityElementsHidden>
          <Text variant="caption" color={colors.onInk} style={{ fontWeight: '600' }}>
            {n}
          </Text>
        </View>
        <Text variant="subheading" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Text>
      </Row>
      {children}
    </Box>
  );
}

/* ---------- inputs ---------- */

/** Six digits, large and evenly spaced. Submits itself on the sixth digit. */
function CodeInput({ onComplete, busy, disabled }: { onComplete: (code: string) => void; busy: boolean; disabled?: boolean }) {
  const { colors, textScale, target, highContrast } = useTheme();
  const [value, setValue] = useState('');
  const change = (raw: string) => {
    const code = normalizeCode(raw);
    setValue(code);
    if (code.length === 6) {
      onComplete(code);
      setValue('');
    }
  };
  return (
    <Row gap={spacing.sm} style={{ alignItems: 'center' }}>
      <TextInput
        value={value}
        onChangeText={change}
        editable={!busy && !disabled}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        placeholder="000000"
        placeholderTextColor={colors.hairlineStrong}
        accessibilityLabel="Six-digit code"
        maxFontSizeMultiplier={1.5}
        style={{
          flex: 1,
          minHeight: target,
          backgroundColor: colors.inset,
          color: colors.ink,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          borderWidth: highContrast ? 2 : 0,
          borderColor: colors.hairlineStrong,
          paddingHorizontal: spacing.md,
          fontSize: 28 * Math.min(textScale, 1.3),
          fontWeight: '600',
          letterSpacing: 6,
          textAlign: 'center',
          fontVariant: ['tabular-nums'],
        }}
      />
      {busy ? <ActivityIndicator color={colors.accent} accessibilityLabel="Checking" /> : null}
    </Row>
  );
}

function RecoveryInput({ onSubmit, busy }: { onSubmit: (code: string) => void; busy: boolean }) {
  const { colors, textScale, target, highContrast } = useTheme();
  const [value, setValue] = useState('');
  return (
    <>
      <TextInput
        value={value}
        onChangeText={setValue}
        editable={!busy}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        placeholder="Backup code"
        placeholderTextColor={colors.ink3}
        accessibilityLabel="Backup code"
        maxFontSizeMultiplier={1.5}
        onSubmitEditing={() => value.trim() && onSubmit(value)}
        style={{
          minHeight: target,
          backgroundColor: colors.inset,
          color: colors.ink,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          borderWidth: highContrast ? 2 : 0,
          borderColor: colors.hairlineStrong,
          paddingHorizontal: spacing.md,
          fontSize: 20 * Math.min(textScale, 1.3),
          fontVariant: ['tabular-nums'],
          textAlign: 'center',
        }}
      />
      <Spacer size={spacing.md} />
      <Button title="Continue" onPress={() => onSubmit(value)} loading={busy} disabled={!value.trim()} />
    </>
  );
}

function ErrorText({ children }: { children: string }) {
  return (
    <Text variant="caption" signal accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ marginTop: spacing.md }}>
      {children}
    </Text>
  );
}
