import { useEffect, type ComponentType } from 'react';
import { Building2, FilePlus2, History, LogOut, X } from 'lucide-react';
import type { View } from '../../types';
import { useActiveUser } from '../../context/UserContext';
import { useCompany } from '../../context/CompanyContext';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

interface NavigationDrawerProps {
  open: boolean;
  current: View;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onNewQuote: () => void;
  onSwitchUser: () => void;
}

interface NavItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  onSelect: () => void;
}

export function NavigationDrawer({ open, current, onClose, onNavigate, onNewQuote, onSwitchUser }: NavigationDrawerProps) {
  const user = useActiveUser();
  const { company } = useCompany();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const items: NavItem[] = [
    { label: 'Nueva Cotización', icon: FilePlus2, active: current === 'quote', onSelect: onNewQuote },
    { label: 'Historial de Cotizaciones', icon: History, active: current === 'history', onSelect: () => onNavigate('history') },
    { label: 'Configuración de Empresa', icon: Building2, active: current === 'config', onSelect: () => onNavigate('config') },
  ];

  return (
    <div className={cn('fixed inset-0 z-40', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div
        className={cn(
          'absolute inset-0 bg-zinc-900/40 transition-opacity duration-200 ease-out',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />
      <nav
        aria-label="Menú principal"
        className={cn(
          'absolute inset-y-0 left-0 flex w-[84%] max-w-xs flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-xl shadow-zinc-900/10 transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {company.logoUrl && <img src={company.logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />}
            <span className="truncate text-[15px] font-semibold text-zinc-900">{company.brandName}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar menú" className="-mr-2">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200/80">
          <span className={cn('flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold', user.tone)}>
            {user.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-zinc-900">{user.name}</p>
            <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Usuario activo
            </span>
          </div>
        </div>

        <ul className="mt-4 flex flex-col gap-1 px-2">
          {items.map(({ label, icon: Icon, active, onSelect }) => (
            <li key={label}>
              <button
                type="button"
                onClick={onSelect}
                className={cn(
                  'flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium transition-colors duration-150',
                  active ? 'bg-brand-50 text-brand-700' : 'text-zinc-700 hover:bg-zinc-100',
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-auto border-t border-zinc-200 p-2">
          <button
            type="button"
            onClick={onSwitchUser}
            className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-100"
          >
            <LogOut className="h-5 w-5" />
            Cambiar Usuario
          </button>
        </div>
      </nav>
    </div>
  );
}
