import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

interface State {
  failed: boolean;
}

/**
 * Last line of defense: an unexpected render error shows a recovery screen instead of a
 * blank page. Drafts live in localStorage, so reloading doesn't lose the quote in progress.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error inesperado en la app', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center ring-1 ring-zinc-200/80">
          <h1 className="text-[17px] font-semibold text-zinc-900">Algo salió mal</h1>
          <p className="mt-2 text-sm text-zinc-600">
            La cotización en curso quedó guardada en este dispositivo. Recargá para seguir donde estabas.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brand-700"
          >
            <RotateCcw className="h-4 w-4" />
            Recargar
          </button>
        </div>
      </main>
    );
  }
}
