import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RepositoryProvider } from '@/data/repository-context';
import { DatabaseProvider } from '@/db/context';
import { AuthProvider, useAuth } from '@/state/auth-context';
import { DevicePrefsProvider, useDevicePrefs } from '@/state/device-prefs';
import { SettingsProvider, useSettings } from '@/state/settings-context';
import { useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);


export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DevicePrefsProvider>
          <ThemedRoot />
        </DevicePrefsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedRoot() {
  const { loaded } = useDevicePrefs();
  const { colors, isDark } = useTheme();
  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      primary: colors.accent,
      background: colors.bg,
      card: colors.bg,
      text: colors.ink,
      border: colors.hairline,
    },
  };
  // the splash stays up until display prefs load, so dark-mode users never see a white flash
  if (!loaded) return null;
  return (
    <ThemeProvider value={navTheme}>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

function useStackOptions() {
  const { colors, textScale, reduceMotion } = useTheme();
  return {
    headerTintColor: colors.accent,
    headerTitleStyle: { color: colors.ink, fontSize: 17 * Math.min(textScale, 1.3), fontWeight: '600' as const },
    headerStyle: { backgroundColor: colors.bg },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: colors.bg },
    animation: reduceMotion ? ('none' as const) : ('default' as const),
  };
}

function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.accent} size="large" accessibilityLabel="Loading" />
    </View>
  );
}

function AuthenticatedApp() {
  const { loading, session, configured, mfa } = useAuth();
  const stackOptions = useStackOptions();

  const hasSession = configured && !!session?.user;
  // a code is only required when two-step is already on for this account
  const needsCode = hasSession && mfa === 'verify';
  const signedIn = hasSession && !needsCode;
  const waiting = loading || (hasSession && mfa === null);

  useEffect(() => {
    if (!waiting && !signedIn) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [waiting, signedIn]);

  if (waiting) return <Loading />;

  if (!signedIn) {
    return (
      <Stack screenOptions={stackOptions}>
        <Stack.Protected guard={!hasSession}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={needsCode}>
          <Stack.Screen name="two-factor" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Screen name="accessibility" options={{ title: 'Accessibility & display' }} />
        <Stack.Protected guard={false}>
          <Stack.Screen name="disclaimer" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="record" />
          <Stack.Screen name="result" />
          <Stack.Screen name="session/[id]" />
          <Stack.Screen name="summary" />
          <Stack.Screen name="tips" />
          <Stack.Screen name="breathe" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="coach" />
        </Stack.Protected>
      </Stack>
    );
  }

  return (
    <DatabaseProvider>
      <RepositoryProvider userId={session.user.id}>
        <SettingsProvider>
          <Navigation />
        </SettingsProvider>
      </RepositoryProvider>
    </DatabaseProvider>
  );
}

function Navigation() {
  const { settings, loaded } = useSettings();
  const stackOptions = useStackOptions();

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  if (!loaded) return <Loading />;

  const accepted = settings.disclaimerAccepted;
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Protected guard={false}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Screen name="two-factor" options={{ title: 'Two-step sign-in' }} />
      <Stack.Screen name="accessibility" options={{ title: 'Accessibility & display' }} />
      <Stack.Protected guard={!accepted}>
        <Stack.Screen name="disclaimer" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={accepted}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="record" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="result" options={{ title: 'Result', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="session/[id]" options={{ title: 'Reading' }} />
        <Stack.Screen name="summary" options={{ title: 'Summary PDF' }} />
        <Stack.Screen name="tips" options={{ title: 'Tips' }} />
        <Stack.Screen name="breathe" options={{ title: 'Breathing' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="coach" options={{ title: 'Ask AI' }} />
      </Stack.Protected>
    </Stack>
  );
}
