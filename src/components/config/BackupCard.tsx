import { useState } from 'react';
import { DatabaseBackup } from 'lucide-react';
import { useActiveUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';
import { downloadBackup, lastBackupAt } from '../../services/backupService';
import { userMessage } from '../../lib/errors';
import { formatDate } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';

const REMIND_AFTER_DAYS = 7;

export function BackupCard() {
  const user = useActiveUser();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(lastBackupAt);

  const stale = !last || Date.now() - new Date(last).getTime() > REMIND_AFTER_DAYS * 86_400_000;

  const onBackup = async () => {
    setBusy(true);
    try {
      const { backup, delivery } = await downloadBackup(user.name);
      if (delivery === 'cancelled') return;
      setLast(backup.createdAt);
      notify(`Respaldo listo: ${backup.counts.quotes} cotizaciones y ${backup.counts.products} productos`);
    } catch (err) {
      console.error(err);
      notify(userMessage(err, 'No se pudo generar el respaldo'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Respaldo"
        description="Un archivo con todas las cotizaciones (de los tres vendedores), los productos y los datos de la empresa."
      />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[13px] text-zinc-600">
          Guardalo fuera de la app (computadora, Drive o WhatsApp). Si algo falla, se puede restaurar todo desde ese
          archivo.
        </p>
        <div
          className={
            stale
              ? 'rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 ring-1 ring-inset ring-amber-200'
              : 'rounded-xl bg-zinc-50 px-3 py-2.5 text-[13px] text-zinc-600 ring-1 ring-inset ring-zinc-200/80'
          }
        >
          {last
            ? `Último respaldo desde este dispositivo: ${formatDate(last, true)}`
            : 'Todavía no se descargó ningún respaldo desde este dispositivo'}
          {stale ? ' · Recomendado: uno por semana.' : ''}
        </div>
        <Button
          variant="secondary"
          size="lg"
          icon={<DatabaseBackup className="h-4 w-4" />}
          loading={busy}
          onClick={onBackup}
        >
          Descargar respaldo
        </Button>
      </div>
    </Card>
  );
}
