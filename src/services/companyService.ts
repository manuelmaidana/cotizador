import { doc, getDoc, onSnapshot, runTransaction, setDoc, type Transaction } from 'firebase/firestore';
import type { CompanyConfig, CompanyInfo } from '../types';
import { COLLECTIONS, db } from './firebase';
import { readJson, writeJson } from './storage';

/** Last known config, so the first paint already shows the right branding. */
const CACHE_KEY = 'app_config:company:v2';

export const companyRef = doc(db, COLLECTIONS.appConfig, 'company');

export const DEFAULT_COMPANY: CompanyConfig = {
  brandName: 'Car Store Belgrano',
  logoUrl: '/logo.png',
  phone: '(011) 4783-1414',
  whatsapp: '(011) 6447-2550',
  address: '11 de Septiembre de 1888 2739, Belgrano, CABA',
  email: 'info@carstore.com.ar',
  instagram: '@carstorebelgrano',
  website: 'www.carstorebelgrano.com',
  quoteSequence: 0,
};

function withDefaults(data: Partial<CompanyConfig> | undefined): CompanyConfig {
  return { ...DEFAULT_COMPANY, ...data };
}

export function getCompanyConfigSync(): CompanyConfig {
  return withDefaults(readJson<Partial<CompanyConfig>>(CACHE_KEY, {}));
}

export async function getCompanyConfig(): Promise<CompanyConfig> {
  const snap = await getDoc(companyRef);
  const config = withDefaults(snap.data() as Partial<CompanyConfig> | undefined);
  writeJson(CACHE_KEY, config);
  return config;
}

/** Live updates of `app_config/company` (edits from any device show up everywhere). */
export function subscribeCompanyConfig(onChange: (config: CompanyConfig) => void): () => void {
  return onSnapshot(
    companyRef,
    (snap) => {
      const config = withDefaults(snap.data() as Partial<CompanyConfig> | undefined);
      writeJson(CACHE_KEY, config);
      onChange(config);
    },
    (err) => console.error('No se pudo leer app_config/company', err),
  );
}

export async function updateCompanyInfo(info: CompanyInfo): Promise<CompanyConfig> {
  // merge: never touches `quoteSequence`.
  await setDoc(companyRef, info, { merge: true });
  const next = { ...getCompanyConfigSync(), ...info };
  writeJson(CACHE_KEY, next);
  return next;
}

/**
 * Atomically reserves the next quote number inside an existing transaction.
 * Creates `app_config/company` with the defaults the first time.
 */
export async function reserveQuoteSequence(tx: Transaction): Promise<{ sequence: number; config: CompanyConfig }> {
  const snap = await tx.get(companyRef);
  const config = withDefaults(snap.data() as Partial<CompanyConfig> | undefined);
  const sequence = (config.quoteSequence ?? 0) + 1;
  if (snap.exists()) tx.update(companyRef, { quoteSequence: sequence });
  else tx.set(companyRef, { ...config, quoteSequence: sequence });
  return { sequence, config: { ...config, quoteSequence: sequence } };
}

/** Standalone increment (when a number is needed outside of quote creation). */
export function nextQuoteSequence(): Promise<number> {
  return runTransaction(db, async (tx) => (await reserveQuoteSequence(tx)).sequence);
}

export function toCompanyInfo(config: CompanyConfig): CompanyInfo {
  const { brandName, logoUrl, phone, whatsapp, address, email, instagram, website } = config;
  return { brandName, logoUrl, phone, whatsapp, address, email, instagram, website };
}
