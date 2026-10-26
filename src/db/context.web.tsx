/**
 * Web stand-in for `context.tsx`. The app needs a phone (accelerometer,
 * SQLite, file sharing), so on web we render a short notice instead of the
 * app tree. Nothing below this provider is mounted, so `useDatabase` is
 * never called on web.
 */
import React from 'react';
import { Text, View } from 'react-native';

import type { SQLiteDatabase } from 'expo-sqlite';

export type Database = SQLiteDatabase;

export function DatabaseProvider(_props: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#0B1220' }}>
      <View style={{ maxWidth: 520, gap: 12 }}>
        <Text style={{ color: '#F1F5F9', fontSize: 24, fontWeight: '700' }}>Tremor Tracker runs on your phone</Text>
        <Text style={{ color: '#A7B2C2', fontSize: 16, lineHeight: 24 }}>
          It needs the accelerometer and on-device storage, which are not available in the browser. Open the project in Expo Go
          by scanning the QR code printed by <Text style={{ fontFamily: 'monospace' }}>npx expo start</Text>.
        </Text>
        <Text style={{ color: '#6F7C8F', fontSize: 13, lineHeight: 20 }}>
          This app tracks movement and is not a medical device. It does not diagnose or treat any condition and does not provide
          medical advice.
        </Text>
      </View>
    </View>
  );
}

export function useDatabase(): Database {
  throw new Error('The database is not available on web.');
}
