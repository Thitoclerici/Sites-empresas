import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Config } from './api.ts';

interface Ctx {
  config: Config | null;
  toast: { msg: string; err?: boolean } | null;
  notify: (msg: string, err?: boolean) => void;
  segmentLabel: (id: string) => string;
  stageLabel: (id: string) => string;
}

const AppCtx = createContext<Ctx>(null as any);

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [toast, setToast] = useState<Ctx['toast']>(null);
  useEffect(() => {
    api.get<Config>('/api/config').then(setConfig).catch(() => setToast({ msg: 'Não foi possível conectar à API.', err: true }));
  }, []);
  const notify = useCallback((msg: string, err?: boolean) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), err ? 6000 : 3000);
  }, []);
  const segmentLabel = (id: string) => config?.segments.find((s) => s.id === id)?.label ?? id;
  const stageLabel = (id: string) => config?.stages.find((s) => s.id === id)?.label ?? id;
  return <AppCtx.Provider value={{ config, toast, notify, segmentLabel, stageLabel }}>{children}</AppCtx.Provider>;
}

export const useApp = () => useContext(AppCtx);

/** Carrega dados com estado de loading/erro e função de recarga. */
export function useLoad<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(() => {
    if (!url) return Promise.resolve();
    setLoading(true);
    return api
      .get<T>(url)
      .then((d) => (setData(d), setError(null)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, setData, error, loading, reload };
}
