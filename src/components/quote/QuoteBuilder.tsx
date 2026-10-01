import { useCallback, useRef, useState, type FormEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { FieldToggles, Product, QuoteItem } from '../../types';
import { useActiveUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';
import {
  deleteProducts,
  findProduct,
  productsMatching,
  suggestProducts,
  suggestValues,
  upsertProduct,
} from '../../services/productService';
import { formatCurrency, generateId } from '../../lib/utils';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field, Input } from '../ui/Input';
import { AutocompleteInput, type Suggestion } from './AutocompleteInput';

interface QuoteBuilderProps {
  toggles: FieldToggles;
  onAddItem: (item: QuoteItem) => void;
}

/** `price` holds digits only; it's displayed with thousands separators. */
const EMPTY = { type: '', brand: '', model: '', price: '' };

const priceDigits = (value: number | string) => String(Math.round(Number(value) || 0)).replace(/\D/g, '');
const groupFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const formatPriceInput = (digits: string) => (digits ? groupFormatter.format(Number(digits)) : '');

/** Pending deletion from the catalog, waiting for the user's confirmation. */
interface Removal {
  kind: 'type' | 'brand' | 'model';
  label: string;
  fieldId: string;
  products: Product[];
}

const MAX_LISTED = 6;

export function QuoteBuilder({ toggles, onAddItem }: QuoteBuilderProps) {
  const user = useActiveUser();
  const notify = useToast();
  const [form, setForm] = useState(EMPTY);
  const [quantity, setQuantity] = useState(1);
  const [priceTouched, setPriceTouched] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [removing, setRemoving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const set = (key: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  // Only narrow suggestions by fields that are on and filled in.
  const ctxType = toggles.type ? form.type.trim() || undefined : undefined;
  const ctxBrand = toggles.brand ? form.brand.trim() || undefined : undefined;
  const context = { type: ctxType, brand: ctxBrand };

  const fetchTypes = useCallback(
    async (q: string): Promise<Suggestion<string>[]> =>
      (await suggestValues('type', q)).map((v) => ({ id: v, label: v, data: v })),
    [],
  );

  const fetchBrands = useCallback(
    async (q: string): Promise<Suggestion<string>[]> =>
      (await suggestValues('brand', q, { type: ctxType })).map((v) => ({ id: v, label: v, data: v })),
    [ctxType],
  );

  const fetchModels = useCallback(
    async (q: string): Promise<Suggestion<Product>[]> =>
      (await suggestProducts(q, { type: ctxType, brand: ctxBrand })).map((p) => ({
        id: p.id,
        label: p.model,
        detail: `${p.type} · ${p.brand} · ${formatCurrency(p.lastPrice)}`,
        data: p,
      })),
    [ctxType, ctxBrand],
  );

  const applyProduct = (p: Product) => {
    setForm((f) => ({
      type: toggles.type ? p.type : f.type,
      brand: toggles.brand ? p.brand : f.brand,
      model: p.model,
      price: toggles.price ? priceDigits(p.lastPrice) : f.price,
    }));
    setPriceTouched(false);
  };

  // Typed an exact model without picking it: still recover its last price.
  const onModelBlur = async () => {
    if (!toggles.price || priceTouched || !form.model.trim()) return;
    const product = await findProduct(form.model, context);
    if (product) setForm((f) => ({ ...f, price: priceDigits(product.lastPrice) }));
  };

  // ---- Deleting saved suggestions (always confirmed) ----------------------
  const requestRemoveValue = (kind: 'type' | 'brand', fieldId: string) => async (s: Suggestion<string>) => {
    const products = await productsMatching(kind, s.data);
    setRemoval({ kind, label: s.data, fieldId, products });
  };

  const requestRemoveModel = (s: Suggestion<Product>) =>
    setRemoval({ kind: 'model', label: s.data.model, fieldId: 'f-model', products: [s.data] });

  const cancelRemoval = useCallback(() => setRemoval(null), []);

  const confirmRemoval = async () => {
    if (!removal) return;
    setRemoving(true);
    try {
      await deleteProducts(removal.products.map((p) => p.id));
      const what = removal.kind === 'type' ? 'Tipo' : removal.kind === 'brand' ? 'Marca' : 'Producto';
      notify(`${what} "${removal.label}" eliminado de las sugerencias`);
      const fieldId = removal.fieldId;
      setRemoval(null);
      // Reopen the list so the change is visible right away.
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
    } catch (err) {
      console.error(err);
      notify('No se pudo eliminar', 'error');
    } finally {
      setRemoving(false);
    }
  };

  const unitPrice = toggles.price ? Number(form.price || 0) : 0;
  const subtotal = unitPrice * quantity;
  const hasDescription =
    (toggles.type && form.type.trim()) || (toggles.brand && form.brand.trim()) || (toggles.model && form.model.trim());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasDescription) {
      notify('Completá al menos el tipo, la marca o el modelo', 'error');
      return;
    }
    setAdding(true);
    const item: QuoteItem = {
      id: generateId(),
      type: toggles.type ? form.type.trim() : '',
      brand: toggles.brand ? form.brand.trim() : '',
      model: toggles.model ? form.model.trim() : '',
      quantity,
      unitPrice,
      subtotal,
    };
    onAddItem(item);

    // Keep the product catalog in sync for future autocomplete.
    if (item.model) {
      const lastPrice = toggles.price ? unitPrice : ((await findProduct(item.model, item))?.lastPrice ?? 0);
      await upsertProduct({ type: item.type, brand: item.brand, model: item.model, lastPrice }, user.id);
    }

    setForm(EMPTY);
    setQuantity(1);
    setPriceTouched(false);
    setAdding(false);
    formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3.5">
      {toggles.type && (
        <Field label="Tipo" htmlFor="f-type">
          <AutocompleteInput
            id="f-type"
            value={form.type}
            placeholder="Polarizado, Audio, Accesorio…"
            onChange={set('type')}
            onPick={(s) => set('type')(s.data)}
            fetchSuggestions={fetchTypes}
            onRemoveSuggestion={requestRemoveValue('type', 'f-type')}
            removeLabel={(s) => `Eliminar el tipo ${s.label}`}
          />
        </Field>
      )}

      {toggles.brand && (
        <Field label="Marca" htmlFor="f-brand">
          <AutocompleteInput
            id="f-brand"
            value={form.brand}
            placeholder="3M, Pioneer…"
            onChange={set('brand')}
            onPick={(s) => set('brand')(s.data)}
            fetchSuggestions={fetchBrands}
            onRemoveSuggestion={requestRemoveValue('brand', 'f-brand')}
            removeLabel={(s) => `Eliminar la marca ${s.label}`}
          />
        </Field>
      )}

      {toggles.model && (
        <Field label="Modelo" htmlFor="f-model">
          <AutocompleteInput
            id="f-model"
            value={form.model}
            placeholder="Polarizado 3M Color Stable"
            onChange={set('model')}
            onPick={(s) => applyProduct(s.data)}
            onBlur={onModelBlur}
            fetchSuggestions={fetchModels}
            onRemoveSuggestion={requestRemoveModel}
            removeLabel={(s) => `Eliminar el producto ${s.label}`}
          />
        </Field>
      )}

      <div className={toggles.price ? 'grid grid-cols-[auto_1fr] gap-3' : ''}>
        <Field label="Cantidad" htmlFor="f-qty">
          <div className="flex h-12 items-center rounded-xl bg-zinc-50 ring-1 ring-inset ring-zinc-200">
            <button
              type="button"
              aria-label="Restar uno"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-12 w-11 items-center justify-center rounded-l-xl text-zinc-600 transition-colors duration-150 active:bg-zinc-200 disabled:opacity-40"
              disabled={quantity <= 1}
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              id="f-qty"
              inputMode="numeric"
              className="h-full w-12 bg-transparent text-center text-[16px] font-semibold tabular-nums text-zinc-900 focus:outline-none"
              value={quantity}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                setQuantity(Number.isFinite(n) ? Math.min(Math.max(n, 1), 9999) : 1);
              }}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              aria-label="Sumar uno"
              onClick={() => setQuantity((q) => Math.min(9999, q + 1))}
              className="flex h-12 w-11 items-center justify-center rounded-r-xl text-zinc-600 transition-colors duration-150 active:bg-zinc-200"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </Field>

        {toggles.price && (
          <Field label="Precio unitario" htmlFor="f-price">
            <Input
              id="f-price"
              // Numeric keypad on phones; anything that isn't a digit is discarded.
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              leading={<span className="text-[15px] font-medium">$</span>}
              value={formatPriceInput(form.price)}
              onChange={(e) => {
                set('price')(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12));
                setPriceTouched(true);
              }}
              onFocus={(e) => e.target.select()}
              className="tabular-nums"
            />
          </Field>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-500">Subtotal ítem</p>
          <p className="truncate text-[17px] font-semibold tabular-nums text-zinc-900">
            {toggles.price ? formatCurrency(subtotal) : 'Sin precio'}
          </p>
        </div>
        <Button type="submit" size="lg" loading={adding} icon={<Plus className="h-4 w-4" />} disabled={!hasDescription}>
          Agregar
        </Button>
      </div>

      <ConfirmDialog
        open={removal !== null}
        title={
          removal?.kind === 'type'
            ? `¿Eliminar el tipo "${removal.label}"?`
            : removal?.kind === 'brand'
              ? `¿Eliminar la marca "${removal.label}"?`
              : `¿Eliminar "${removal?.label ?? ''}"?`
        }
        busy={removing}
        onCancel={cancelRemoval}
        onConfirm={confirmRemoval}
      >
        {removal && <RemovalDetails removal={removal} />}
      </ConfirmDialog>
    </form>
  );
}

function RemovalDetails({ removal }: { removal: Removal }) {
  const { kind, products } = removal;
  const footer = (
    <p className="mt-2 text-[13px] text-zinc-500">
      Ya no aparecerá en las sugerencias. Las cotizaciones ya hechas no se modifican.
    </p>
  );

  if (kind === 'model') {
    const p = products[0];
    const origin = [p?.type, p?.brand].filter(Boolean).join(' · ');
    return (
      <>
        <p>Se borrará este producto guardado{origin ? ` (${origin})` : ''}.</p>
        {footer}
      </>
    );
  }

  const count = products.length;
  const listed = products.slice(0, MAX_LISTED);
  return (
    <>
      <p>
        Se {count === 1 ? 'borrará' : 'borrarán'}{' '}
        <strong className="font-semibold text-zinc-900">
          {count} {count === 1 ? 'producto guardado' : 'productos guardados'}
        </strong>{' '}
        {kind === 'type' ? 'de este tipo' : 'de esta marca'}:
      </p>
      <ul className="mt-2 flex flex-col gap-1 rounded-xl bg-zinc-50 px-3 py-2 text-[13px] text-zinc-700 ring-1 ring-inset ring-zinc-200/80">
        {listed.map((p) => (
          <li key={p.id} className="truncate">
            {p.model || [p.type, p.brand].filter(Boolean).join(' · ')}
          </li>
        ))}
        {count > MAX_LISTED && <li className="text-zinc-500">y {count - MAX_LISTED} más…</li>}
      </ul>
      {footer}
    </>
  );
}
