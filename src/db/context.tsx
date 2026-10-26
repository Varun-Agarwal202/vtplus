/**
 * Database provider/hook for native. `context.web.tsx` supplies the equivalent
 * provider for the browser's local SQLite implementation.
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
