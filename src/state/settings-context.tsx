import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useRepository } from '@/data/repository-context';
import { DEFAULT_SETTINGS, type Settings } from '@/db/settings';

interface SettingsContextValue {
  settings: Settings;
  loaded: boolean;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const repo = useRepository();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const s = await repo.loadSettings();
    setSettings(s);
    setLoaded(true);
  }, [repo]);

  useEffect(() => {
    let alive = true;
    repo
      .loadSettings()
      .then((s) => {
        if (!alive) return;
        setSettings(s);
        setLoaded(true);
      })
      .catch((e) => {
        console.warn('settings load failed', e);
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [repo]);

  const set = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        void repo.saveSetting(key, value, prev).catch((e) => console.warn('settings save failed', e));
        return next;
      });
    },
    [repo],
  );

  const value = useMemo(() => ({ settings, loaded, set, reload }), [settings, loaded, set, reload]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
