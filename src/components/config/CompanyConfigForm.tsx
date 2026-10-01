import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AtSign, Globe, ImageUp, Mail, MapPin, Phone, RotateCcw, Save } from 'lucide-react';
import type { CompanyInfo } from '../../types';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import { DEFAULT_COMPANY } from '../../services/companyService';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Field, Input } from '../ui/Input';

/** Downscales an uploaded logo so it fits comfortably in localStorage (and later, Firestore). */
function fileToResizedDataUrl(file: File, maxSize = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Imagen inválida'));
    };
    img.src = url;
  });
}

const FIELDS: Array<{
  key: Exclude<keyof CompanyInfo, 'logoUrl' | 'brandName'>;
  label: string;
  icon: typeof Phone;
  type?: string;
  inputMode?: 'tel' | 'email' | 'url';
  placeholder: string;
}> = [
  { key: 'phone', label: 'Teléfono', icon: Phone, type: 'tel', inputMode: 'tel', placeholder: '+54 9 11 …' },
  { key: 'email', label: 'Email', icon: Mail, type: 'email', inputMode: 'email', placeholder: 'ventas@empresa.com' },
  { key: 'address', label: 'Dirección', icon: MapPin, placeholder: 'Calle 123, Ciudad' },
  { key: 'instagram', label: 'Instagram', icon: AtSign, placeholder: '@empresa' },
  { key: 'website', label: 'Sitio web', icon: Globe, inputMode: 'url', placeholder: 'www.empresa.com' },
];

export function CompanyConfigForm() {
  const { company, saveCompany } = useCompany();
  const notify = useToast();
  const [form, setForm] = useState<CompanyInfo>(company);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(company);
  const update = (key: keyof CompanyInfo, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const onLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      update('logoUrl', await fileToResizedDataUrl(file));
    } catch {
      notify('No se pudo leer la imagen', 'error');
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await saveCompany({ ...form, brandName: form.brandName.trim() || DEFAULT_COMPANY.brandName });
    setSaving(false);
    notify('Datos de la empresa actualizados');
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-32 pt-4">
      <Card>
        <CardHeader title="Marca" description="Aparece en la vista previa y en el PDF." />
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-50 ring-1 ring-inset ring-zinc-200">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo" className="h-full w-full object-contain p-1.5" />
              ) : (
                <ImageUp className="h-6 w-6 text-zinc-400" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="secondary" icon={<ImageUp className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
                Subir logo
              </Button>
              {form.logoUrl !== DEFAULT_COMPANY.logoUrl && (
                <Button
                  variant="ghost"
                  icon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => update('logoUrl', DEFAULT_COMPANY.logoUrl)}
                >
                  Logo por defecto
                </Button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogo} />
          </div>
          <Field label="Nombre comercial" htmlFor="c-brand">
            <Input id="c-brand" value={form.brandName} onChange={(e) => update('brandName', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Contacto" description="Dejá vacío lo que no quieras mostrar." />
        <div className="flex flex-col gap-4 p-4">
          {FIELDS.map(({ key, label, icon: Icon, type, inputMode, placeholder }) => (
            <Field key={key} label={label} htmlFor={`c-${key}`}>
              <Input
                id={`c-${key}`}
                type={type}
                inputMode={inputMode}
                placeholder={placeholder}
                leading={<Icon className="h-4 w-4" />}
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </Card>

      <p className="px-1 text-xs text-zinc-500">
        Las cotizaciones ya guardadas conservan los datos de la empresa del momento en que se crearon.
      </p>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl px-4">
          <Button type="submit" size="lg" className="flex-1" icon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </form>
  );
}
