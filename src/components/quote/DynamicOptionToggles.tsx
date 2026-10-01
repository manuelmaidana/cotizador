import { Check } from 'lucide-react';
import type { FieldToggles, ItemField } from '../../types';
import { cn } from '../../lib/utils';

const OPTIONS: Array<{ field: ItemField; label: string }> = [
  { field: 'type', label: 'Tipo' },
  { field: 'brand', label: 'Marca' },
  { field: 'model', label: 'Modelo' },
  { field: 'price', label: 'Precio' },
];

const DESCRIPTIVE: ItemField[] = ['type', 'brand', 'model'];

interface DynamicOptionTogglesProps {
  value: FieldToggles;
  onChange: (next: FieldToggles) => void;
}

export function DynamicOptionToggles({ value, onChange }: DynamicOptionTogglesProps) {
  const enabledDescriptive = DESCRIPTIVE.filter((f) => value[f]).length;

  return (
    <div role="group" aria-label="Campos del producto" className="flex flex-wrap gap-2">
      {OPTIONS.map(({ field, label }) => {
        const active = value[field];
        // At least one descriptive field must stay on so every row has a description.
        const locked = active && DESCRIPTIVE.includes(field) && enabledDescriptive === 1;
        return (
          <button
            key={field}
            type="button"
            aria-pressed={active}
            disabled={locked}
            title={locked ? 'Debe quedar al menos un campo descriptivo' : undefined}
            onClick={() => onChange({ ...value, [field]: !active })}
            className={cn(
              'inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-150 ease-out',
              active
                ? 'bg-brand-600 text-white'
                : 'bg-white text-zinc-500 ring-1 ring-inset ring-zinc-200 hover:text-zinc-800',
              locked && 'cursor-not-allowed opacity-70',
            )}
          >
            {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
