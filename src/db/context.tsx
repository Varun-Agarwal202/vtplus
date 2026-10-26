/**
 * Database provider/hook for native. `context.web.tsx` replaces this on web,
 * where the app is not supported (no accelerometer, and expo-sqlite's web
 * worker build is still alpha), so expo-sqlite never enters the web bundle.
 */
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import React from 'react';

import { DATABASE_NAME, migrate } from './schema';

export type Database = SQLiteDatabase;

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} onError={(e) => console.error('database init failed', e)}>
      {children}
    </SQLiteProvider>
  );
}

export const useDatabase: () => Database = useSQLiteContext;
