import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppUser, UserId } from '../types';
import { readJson, removeKey, writeJson } from '../services/storage';
import {
  claimSession,
  heartbeat,
  HEARTBEAT_MS,
  isHeldByOther,
  releaseSession,
  subscribeSession,
  type ClaimResult,
} from '../services/sessionService';

export const USERS: AppUser[] = [
  { id: 'chino', name: 'Chino', initials: 'CH', tone: 'bg-brand-600 text-white' },
  { id: 'damian', name: 'Damian', initials: 'DA', tone: 'bg-zinc-900 text-white' },
  { id: 'rulo', name: 'Rulo', initials: 'RU', tone: 'bg-emerald-600 text-white' },
];

const STORAGE_KEY = 'activeUser';

interface UserContextValue {
  activeUser: AppUser | null;
  /** Claims the seller for this device. Throws if Firestore can't be reached. */
  selectUser: (id: UserId) => Promise<ClaimResult>;
  clearUser: () => void;
  /** Why this device was sent back to the selector (e.g. seller taken by another device). */
  notice: string | null;
  dismissNotice: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

function loadInitialUser(): AppUser | null {
  const id = readJson<UserId | null>(STORAGE_KEY, null);
  return USERS.find((u) => u.id === id) ?? null;
}

const takenMessage = (user: AppUser, label: string) =>
  `${user.name} se está usando en otro dispositivo (${label}).`;

export function UserProvider({ children }: { children: ReactNode }) {
  const [activeUser, setActiveUser] = useState<AppUser | null>(loadInitialUser);
  const [notice, setNotice] = useState<string | null>(null);
  const claiming = useRef(false);

  const signOutLocally = useCallback((message: string | null) => {
    setActiveUser(null);
    removeKey(STORAGE_KEY);
    setNotice(message);
  }, []);

  const selectUser = useCallback(async (id: UserId) => {
    const user = USERS.find((u) => u.id === id);
    if (!user) throw new Error('Vendedor desconocido');
    const result = await claimSession(id);
    if (result.ok) {
      setActiveUser(user);
      writeJson(STORAGE_KEY, user.id);
      setNotice(null);
    }
    return result;
  }, []);

  const clearUser = useCallback(() => {
    if (activeUser) {
      // Frees the seller for other devices (queued if offline).
      releaseSession(activeUser.id).catch((err) => console.warn('No se pudo liberar el vendedor', err));
    }
    signOutLocally(null);
  }, [activeUser, signOutLocally]);

  // While a seller is active on this device: keep the hold alive and watch for takeovers.
  useEffect(() => {
    if (!activeUser) return;
    const user = activeUser;
    let disposed = false;

    const claim = () => {
      if (claiming.current) return;
      claiming.current = true;
      claimSession(user.id)
        .then((result) => {
          if (!disposed && !result.ok) signOutLocally(takenMessage(user, result.holder.deviceLabel));
        })
        // Offline: keep working with the local session; it is re-checked when back online.
        .catch(() => undefined)
        .finally(() => {
          claiming.current = false;
        });
    };

    // Re-validate on startup (the seller may have been taken while this device was away).
    claim();

    const unsubscribe = subscribeSession(user.id, (session) => {
      if (disposed) return;
      if (!session) claim();
      else if (isHeldByOther(session)) signOutLocally(takenMessage(user, session.deviceLabel));
    });

    const beat = () => heartbeat(user.id).catch(() => undefined);
    const interval = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') claim();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      unsubscribe();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeUser, signOutLocally]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({ activeUser, selectUser, clearUser, notice, dismissNotice }),
    [activeUser, selectUser, clearUser, notice, dismissNotice],
  );
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
}

/** For screens that only render once a user is selected. */
export function useActiveUser(): AppUser {
  const { activeUser } = useUser();
  if (!activeUser) throw new Error('No active user');
  return activeUser;
}
