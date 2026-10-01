import { useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, Loader2, Lock, X } from 'lucide-react';
import type { UserId } from '../../types';
import { USERS, useUser } from '../../context/UserContext';
import { useCompany } from '../../context/CompanyContext';
import { isHeldByOther, SESSION_TTL_MS, subscribeSessions, type SellerSession } from '../../services/sessionService';
import { cn } from '../../lib/utils';

/** "hace 5 min" / "hace 2 h" */
function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

/** Time left until an inactive hold expires: "en 11 h" / "en 40 min" */
function freesIn(iso: string): string {
  const min = Math.max(1, Math.ceil((new Date(iso).getTime() + SESSION_TTL_MS - Date.now()) / 60000));
  return min >= 60 ? `en ${Math.ceil(min / 60)} h` : `en ${min} min`;
}

export function UserSelector() {
  const { selectUser, notice, dismissNotice } = useUser();
  const { company } = useCompany();
  const [sessions, setSessions] = useState<Partial<Record<UserId, SellerSession>>>({});
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<UserId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeSessions(
      (s) => {
        setSessions(s);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    // Don't keep the buttons disabled forever without signal: the claim itself reports the problem.
    const fallback = setTimeout(() => setLoaded(true), 4000);
    return () => {
      unsubscribe();
      clearTimeout(fallback);
    };
  }, []);

  // Refresh the "hace X min" texts and expiries every minute.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const choose = async (id: UserId) => {
    setPending(id);
    setError(null);
    dismissNotice();
    try {
      const result = await selectUser(id);
      if (!result.ok) {
        const name = USERS.find((u) => u.id === id)?.name;
        setError(`${name} se está usando en otro dispositivo (${result.holder.deviceLabel}).`);
      }
    } catch (err) {
      console.error(err);
      setError('Se necesita conexión a internet para elegir un vendedor.');
    } finally {
      setPending(null);
    }
  };

  const message = error ?? notice;

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+3rem)]">
      <div className="mx-auto flex w-full max-w-md flex-1 animate-fade-in flex-col">
        <div className="flex items-center gap-3">
          {company.logoUrl && (
            <img src={company.logoUrl} alt="" className="h-11 w-11 rounded-xl object-contain" />
          )}
          <div>
            <p className="text-[13px] font-medium text-zinc-500">{company.brandName}</p>
            <p className="text-[15px] font-semibold text-zinc-900">Cotizador Móvil</p>
          </div>
        </div>

        <h1 className="mt-12 text-[28px] font-bold leading-tight tracking-tight text-zinc-900">
          ¿Quién cotiza hoy?
        </h1>
        <p className="mt-2 text-[15px] text-zinc-600">
          Elegí tu perfil. Cada vendedor se usa en un solo dispositivo a la vez.
        </p>

        {message && (
          <div
            role="alert"
            className="mt-6 flex animate-slide-up items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="flex-1">{message}</p>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => {
                setError(null);
                dismissNotice();
              }}
              className="-m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-amber-700 hover:bg-amber-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <ul className="mt-6 flex flex-col gap-3">
          {USERS.map((user) => {
            const session = sessions[user.id];
            const busy = isHeldByOther(session);
            const isPending = pending === user.id;
            return (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => choose(user.id)}
                  disabled={busy || pending !== null || !loaded}
                  aria-describedby={busy ? `busy-${user.id}` : undefined}
                  className={cn(
                    'group flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left ring-1 ring-zinc-200/80 transition-[box-shadow,transform,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                    busy ? 'cursor-not-allowed bg-zinc-50' : 'hover:ring-zinc-300 active:scale-[0.99]',
                    !busy && pending !== null && !isPending && 'opacity-60',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-bold tracking-wide',
                      busy ? 'bg-zinc-200 text-zinc-500' : user.tone,
                    )}
                  >
                    {user.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-[17px] font-semibold', busy ? 'text-zinc-500' : 'text-zinc-900')}>
                      {user.name}
                    </span>
                    {busy && session ? (
                      <span id={`busy-${user.id}`} className="mt-0.5 block text-[13px] leading-snug text-zinc-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-200/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                          <Lock className="h-3 w-3" />
                          En uso
                        </span>{' '}
                        en {session.deviceLabel} · {ago(session.lastSeen)}
                        <span className="block text-xs text-zinc-400">
                          Se libera {freesIn(session.lastSeen)} si no se usa
                        </span>
                      </span>
                    ) : (
                      <span className="block text-[13px] text-zinc-500">Vendedor</span>
                    )}
                  </span>
                  {isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                  ) : busy ? (
                    <Lock className="h-5 w-5 text-zinc-300" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-zinc-400 transition-transform duration-150 group-hover:translate-x-0.5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
