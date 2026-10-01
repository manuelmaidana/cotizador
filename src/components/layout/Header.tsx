import { Menu } from 'lucide-react';
import { useActiveUser } from '../../context/UserContext';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

interface HeaderProps {
  title: string;
  onOpenMenu: () => void;
  onUserClick: () => void;
}

export function Header({ title, onOpenMenu, onUserClick }: HeaderProps) {
  const user = useActiveUser();

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-zinc-50/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2">
        <Button variant="ghost" size="icon" onClick={onOpenMenu} aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="flex-1 truncate text-[16px] font-semibold text-zinc-900">{title}</h1>
        <button
          type="button"
          onClick={onUserClick}
          aria-label={`Usuario activo: ${user.name}. Cambiar usuario`}
          className="mr-1 flex h-11 items-center gap-2 rounded-full pl-1 pr-3 ring-1 ring-inset ring-zinc-200 transition-colors duration-150 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold', user.tone)}>
            {user.initials}
          </span>
          <span className="text-sm font-semibold text-zinc-800">{user.name}</span>
        </button>
      </div>
    </header>
  );
}
