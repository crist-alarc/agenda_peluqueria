import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { BusinessSettings } from '../types/database';
import { supabase } from './supabase';

const DEFAULT_SETTINGS: BusinessSettings = {
  id: 1,
  name: 'Mi Peluquería',
  timezone: 'America/Santiago',
  currency: 'CLP',
  slot_interval_minutes: 15,
  booking_window_days: 30,
  phone: null,
  address: null,
};

type AppContextValue = {
  settings: BusinessSettings;
  reloadSettings: () => Promise<void>;
  session: Session | null;
  isAdmin: boolean;
  authLoading: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const reloadSettings = useCallback(async () => {
    const { data } = await supabase.from('business_settings').select('*').eq('id', 1).maybeSingle();
    if (data) setSettings(data);
  }, []);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  useEffect(() => {
    let cancelled = false;

    async function apply(next: Session | null) {
      setSession(next);
      if (!next) {
        setIsAdmin(false);
        setAuthLoading(false);
        return;
      }
      const { data } = await supabase.rpc('is_admin');
      if (!cancelled) {
        setIsAdmin(Boolean(data));
        setAuthLoading(false);
      }
    }

    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Diferimos la llamada para no bloquear el callback de auth
      setTimeout(() => void apply(next), 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <AppContext.Provider value={{ settings, reloadSettings, session, isAdmin, authLoading }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de <AppProvider>');
  return ctx;
}
