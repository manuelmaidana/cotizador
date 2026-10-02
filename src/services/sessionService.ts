import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';
import type { UserId } from '../types';
import { generateId } from '../lib/utils';
import { withRetry, withTimeout } from '../lib/errors';
import { COLLECTIONS, db } from './firebase';
import { readJson, writeJson } from './storage';

/**
 * One device per seller.
 * `sessions/{userId}` records which device holds each seller. A seller is free when it has
 * no session, or when the holder hasn't been active for SESSION_TTL_MS (app closed/offline).
 * While the app is open the holder refreshes `lastSeen` every HEARTBEAT_MS.
 */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const HEARTBEAT_MS = 5 * 60 * 1000;
const TRANSACTION_TIMEOUT_MS = 12_000;
/** Total time a seller may wait when choosing their profile before seeing an error. */
const CLAIM_DEADLINE_MS = 30_000;

const sessionsCol = collection(db, COLLECTIONS.sessions);

export interface SellerSession {
  userId: UserId;
  deviceId: string;
  deviceLabel: string;
  lastSeen: string; // ISO
}

/* ---- This device ------------------------------------------------------------ */

const DEVICE_KEY = 'deviceId';

/** Stable random ID for this browser on this device. */
export function getDeviceId(): string {
  let id = readJson<string | null>(DEVICE_KEY, null);
  if (!id) {
    id = generateId();
    writeJson(DEVICE_KEY, id);
  }
  return id;
}

/** Human description such as "Android · Chrome", shown to other devices. */
export function getDeviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Dispositivo';
  const browser = /SamsungBrowser/.test(ua)
    ? 'Samsung Internet'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari/.test(ua)
              ? 'Safari'
              : 'Navegador';
  return `${os} · ${browser}`;
}

/* ---- Helpers ------------------------------------------------------------------ */

function lastSeenMs(data: DocumentData | undefined): number {
  const ts = data?.lastSeen;
  return ts instanceof Timestamp ? ts.toMillis() : Date.now(); // pending server value = just now
}

/** Held by another device that was active within the TTL. */
export function isHeldByOther(session: SellerSession | undefined, deviceId = getDeviceId()): boolean {
  if (!session || session.deviceId === deviceId) return false;
  return Date.now() - new Date(session.lastSeen).getTime() < SESSION_TTL_MS;
}

/* ---- Reads -------------------------------------------------------------------- */

/** Live map of who holds each seller (for the seller selector). */
export function subscribeSessions(
  onChange: (sessions: Partial<Record<UserId, SellerSession>>) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    sessionsCol,
    (snap) => {
      const map: Partial<Record<UserId, SellerSession>> = {};
      for (const d of snap.docs) {
        const data = d.data({ serverTimestamps: 'estimate' });
        map[d.id as UserId] = {
          userId: d.id as UserId,
          deviceId: data.deviceId,
          deviceLabel: data.deviceLabel ?? 'otro dispositivo',
          lastSeen: new Date(lastSeenMs(data)).toISOString(),
        };
      }
      onChange(map);
    },
    (err) => {
      console.error('No se pudieron leer las sesiones', err);
      onError?.(err);
    },
  );
}

/** Live session of one seller; `null` when nobody holds it. */
export function subscribeSession(userId: UserId, onChange: (session: SellerSession | null) => void): () => void {
  return onSnapshot(
    doc(sessionsCol, userId),
    (snap) => {
      if (!snap.exists()) return onChange(null);
      const data = snap.data({ serverTimestamps: 'estimate' });
      onChange({
        userId,
        deviceId: data.deviceId,
        deviceLabel: data.deviceLabel ?? 'otro dispositivo',
        lastSeen: new Date(lastSeenMs(data)).toISOString(),
      });
    },
    (err) => console.error('No se pudo leer la sesión', err),
  );
}

/* ---- Writes ------------------------------------------------------------------- */

export type ClaimResult = { ok: true } | { ok: false; holder: SellerSession };

/**
 * Takes the seller for this device, atomically. Fails if another device holds it and
 * was active within the TTL. Re-claiming from the same device just refreshes it.
 * Throws when Firestore can't be reached (claiming needs a connection).
 */
export function claimSession(userId: UserId): Promise<ClaimResult> {
  const deviceId = getDeviceId();
  const ref = doc(sessionsCol, userId);
  // Re-claiming from the same device is idempotent, so a slow attempt (weak signal) or a
  // conflict with another device's simultaneous claim is simply retried.
  return withRetry(() => withTimeout(
    runTransaction(db, async (tx): Promise<ClaimResult> => {
      const snap = await tx.get(ref);
      const data = snap.data();
      if (snap.exists() && data?.deviceId !== deviceId && Date.now() - lastSeenMs(data) < SESSION_TTL_MS) {
        return {
          ok: false,
          holder: {
            userId,
            deviceId: data?.deviceId,
            deviceLabel: data?.deviceLabel ?? 'otro dispositivo',
            lastSeen: new Date(lastSeenMs(data)).toISOString(),
          },
        };
      }
      const sameDevice = snap.exists() && data?.deviceId === deviceId;
      tx.set(ref, {
        deviceId,
        deviceLabel: getDeviceLabel(),
        claimedAt: sameDevice ? data?.claimedAt : serverTimestamp(),
        lastSeen: serverTimestamp(),
      });
      return { ok: true };
    }),
    TRANSACTION_TIMEOUT_MS,
  ), { attempts: 4, deadlineMs: CLAIM_DEADLINE_MS });
}

/** Keeps this device's hold alive. Never touches a session owned by someone else. */
export async function heartbeat(userId: UserId): Promise<void> {
  const deviceId = getDeviceId();
  const ref = doc(sessionsCol, userId);
  await withTimeout(
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists() && snap.data().deviceId === deviceId) tx.update(ref, { lastSeen: serverTimestamp() });
    }),
    TRANSACTION_TIMEOUT_MS,
  );
}

/** Frees the seller ("Cambiar Usuario"), only if this device holds it. */
export async function releaseSession(userId: UserId): Promise<void> {
  const deviceId = getDeviceId();
  const ref = doc(sessionsCol, userId);
  await withTimeout(
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists() && snap.data().deviceId === deviceId) tx.delete(ref);
    }),
    TRANSACTION_TIMEOUT_MS,
  );
}
