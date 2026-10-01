import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CompanyConfig, CompanyInfo } from '../types';
import {
  getCompanyConfigSync,
  subscribeCompanyConfig,
  toCompanyInfo,
  updateCompanyInfo,
} from '../services/companyService';

interface CompanyContextValue {
  company: CompanyInfo;
  saveCompany: (info: CompanyInfo) => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<CompanyConfig>(getCompanyConfigSync);

  useEffect(() => subscribeCompanyConfig(setConfig), []);

  const saveCompany = useCallback(async (info: CompanyInfo) => {
    setConfig(await updateCompanyInfo(info));
  }, []);

  const company = useMemo(() => toCompanyInfo(config), [config]);
  const value = useMemo(() => ({ company, saveCompany }), [company, saveCompany]);
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used inside <CompanyProvider>');
  return ctx;
}
