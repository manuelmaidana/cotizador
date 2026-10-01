import { useCallback, useState } from 'react';
import type { Quote, View } from './types';
import { useActiveUser, useUser } from './context/UserContext';
import { useToast } from './context/ToastContext';
import { useQuoteDraft } from './hooks/useQuoteDraft';
import { Header } from './components/layout/Header';
import { NavigationDrawer } from './components/layout/NavigationDrawer';
import { UserSelector } from './components/layout/UserSelector';
import { QuoteScreen } from './components/quote/QuoteScreen';
import { QuoteHistoryList } from './components/history/QuoteHistoryList';
import { CompanyConfigForm } from './components/config/CompanyConfigForm';

const TITLES: Record<View, string> = {
  quote: 'Cotización',
  history: 'Historial',
  config: 'Configuración de Empresa',
};

export default function App() {
  const { activeUser } = useUser();
  if (!activeUser) return <UserSelector />;
  // Keyed by user so every piece of per-user state resets on switch.
  return <Workspace key={activeUser.id} />;
}

function Workspace() {
  const user = useActiveUser();
  const { clearUser } = useUser();
  const notify = useToast();
  const draftApi = useQuoteDraft(user.id);
  const [view, setView] = useState<View>('quote');
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const navigate = (next: View) => {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  const newQuote = () => {
    const { draft } = draftApi;
    if (draft.dirty && draft.items.length > 0 && !window.confirm('Hay cambios sin guardar. ¿Descartarlos y empezar una cotización nueva?')) {
      return;
    }
    draftApi.reset();
    navigate('quote');
  };

  const openInEditor = (quote: Quote, asCopy: boolean) => {
    const { draft } = draftApi;
    if (draft.dirty && draft.items.length > 0 && !window.confirm('El borrador actual tiene cambios sin guardar. ¿Reemplazarlo?')) {
      return;
    }
    draftApi.loadQuote(quote, asCopy);
    notify(asCopy ? `Copia de ${quote.quoteNumber} lista para editar` : `Editando ${quote.quoteNumber}`);
    navigate('quote');
  };

  const title = view === 'quote' && draftApi.draft.quoteNumber ? draftApi.draft.quoteNumber : TITLES[view];

  return (
    <div className="min-h-dvh bg-zinc-50">
      <Header title={title} onOpenMenu={() => setMenuOpen(true)} onUserClick={clearUser} />
      <main key={view} className="animate-fade-in">
        {view === 'quote' && <QuoteScreen draftApi={draftApi} />}
        {view === 'history' && <QuoteHistoryList onOpenInEditor={openInEditor} onNewQuote={newQuote} />}
        {view === 'config' && <CompanyConfigForm />}
      </main>
      <NavigationDrawer
        open={menuOpen}
        current={view}
        onClose={closeMenu}
        onNavigate={navigate}
        onNewQuote={newQuote}
        onSwitchUser={clearUser}
      />
    </div>
  );
}
