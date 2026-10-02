import { collection, doc, getDocFromServer, getDocsFromServer, Timestamp } from 'firebase/firestore';
import { UserFacingError } from '../lib/errors';
import { COLLECTIONS, db } from './firebase';
import { readJson, writeJson } from './storage';

/**
 * Full backup of the business data as one JSON file: every quote (all sellers), every
 * product and the company config. Restored with `scripts/restore-backup.mjs`.
 *
 * Firestore Timestamps are stored as `{ "__timestamp": "<ISO date>" }` so the restore
 * script can turn them back into real Timestamps.
 */
export const BACKUP_FORMAT = 'cotizador-backup';
export const BACKUP_VERSION = 1;

const LAST_BACKUP_KEY = 'lastBackupAt';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  createdBy: string;
  counts: { quotes: number; products: number };
  company: Record<string, unknown> | null;
  quotes: Array<{ id: string } & Record<string, unknown>>;
  products: Array<{ id: string } & Record<string, unknown>>;
}

function encode(value: unknown): unknown {
  if (value instanceof Timestamp) return { __timestamp: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  }
  return value;
}

/** Reads everything straight from the server, so the file is never a partial offline copy. */
export async function createBackup(createdBy: string): Promise<BackupFile> {
  let quotes, products, company;
  try {
    [quotes, products, company] = await Promise.all([
      getDocsFromServer(collection(db, COLLECTIONS.quotes)),
      getDocsFromServer(collection(db, COLLECTIONS.products)),
      getDocFromServer(doc(db, COLLECTIONS.appConfig, 'company')),
    ]);
  } catch {
    throw new UserFacingError('Para descargar un respaldo completo hace falta conexión a internet.');
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    createdBy,
    counts: { quotes: quotes.size, products: products.size },
    company: company.exists() ? (encode(company.data()) as Record<string, unknown>) : null,
    quotes: quotes.docs.map((d) => ({ id: d.id, ...(encode(d.data()) as Record<string, unknown>) })),
    products: products.docs.map((d) => ({ id: d.id, ...(encode(d.data()) as Record<string, unknown>) })),
  };
}

function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `respaldo-cotizador-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

export type BackupDelivery = 'shared' | 'downloaded' | 'cancelled';

/**
 * Builds the backup and hands it to the user: share sheet on phones (WhatsApp, Drive…),
 * regular download elsewhere or when sharing isn't available.
 */
export async function downloadBackup(createdBy: string): Promise<{ backup: BackupFile; delivery: BackupDelivery }> {
  const backup = await createBackup(createdBy);
  const name = backupFileName(new Date(backup.createdAt));
  const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch && 'canShare' in navigator) {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Respaldo Cotizador', text: name });
        writeJson(LAST_BACKUP_KEY, backup.createdAt);
        return { backup, delivery: 'shared' };
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return { backup, delivery: 'cancelled' };
        // Any other failure falls back to a regular download.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  writeJson(LAST_BACKUP_KEY, backup.createdAt);
  return { backup, delivery: 'downloaded' };
}

/** When this device last produced a backup (ISO), if ever. */
export function lastBackupAt(): string | null {
  return readJson<string | null>(LAST_BACKUP_KEY, null);
}
