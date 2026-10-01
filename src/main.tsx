import { createRoot } from 'react-dom/client';
import { missingFirebaseEnv } from './lib/firebaseEnv';
import './index.css';

const root = createRoot(document.getElementById('root')!);
const missing = missingFirebaseEnv();

if (missing.length) {
  // A misconfigured deploy (e.g. no env vars on the host) shows this instead of a blank page.
  root.render(<ConfigError missing={missing} />);
} else {
  import('./bootstrap').then(({ mount }) => mount(root));
}

function ConfigError({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 ring-1 ring-zinc-200/80">
        <h1 className="text-[17px] font-semibold text-zinc-900">Falta configurar Firebase</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Esta versión se publicó sin las variables de entorno de Firebase. Agregalas en el hosting (en Vercel:
          Settings → Environment Variables) y volvé a desplegar.
        </p>
        <ul className="mt-4 flex flex-col gap-1 rounded-xl bg-zinc-50 px-3 py-2.5 font-mono text-xs text-zinc-700 ring-1 ring-inset ring-zinc-200/80">
          {missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
