import {
  collection,
  doc,
  onSnapshot,
  Timestamp,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { Product, UserId } from '../types';
import { normalize } from '../lib/utils';
import { COLLECTIONS, db } from './firebase';

const productsCol = collection(db, COLLECTIONS.products);

const SEED: Array<Pick<Product, 'type' | 'brand' | 'model' | 'lastPrice'>> = [
  { type: 'Polarizado', brand: '3M', model: 'Polarizado 3M Color Stable', lastPrice: 0 },
  { type: 'Lámina de Seguridad', brand: '3M', model: 'Lámina de Seguridad Ultra 800', lastPrice: 0 },
  { type: 'Multimedia', brand: 'Pioneer', model: 'Estéreo Apple CarPlay / Android Auto', lastPrice: 0 },
  { type: 'Audio', brand: 'Pioneer', model: 'Parlantes Pioneer Componentes', lastPrice: 0 },
  { type: 'Accesorio', brand: 'Car Store', model: 'Cámara de Retroceso HD', lastPrice: 0 },
  { type: 'Estética', brand: 'Car Store', model: 'Tratamiento Cerámico PPF', lastPrice: 0 },
];

function buildSearchKey(p: Pick<Product, 'type' | 'brand' | 'model'>): string {
  return normalize(`${p.type} ${p.brand} ${p.model}`);
}

/**
 * Deterministic document ID derived from type + brand + model, so concurrent upserts
 * from different devices land on the same document instead of creating duplicates.
 */
function productId(p: Pick<Product, 'type' | 'brand' | 'model'>): string {
  return buildSearchKey(p).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200) || 'producto';
}

function fromDoc(snap: QueryDocumentSnapshot<DocumentData>): Product {
  const d = snap.data();
  return {
    id: snap.id,
    type: d.type ?? '',
    brand: d.brand ?? '',
    model: d.model ?? '',
    lastPrice: typeof d.lastPrice === 'number' ? d.lastPrice : 0,
    updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate().toISOString() : new Date(0).toISOString(),
    createdByUser: d.createdByUser ?? 'chino',
    searchKey: d.searchKey ?? buildSearchKey(d as Product),
  };
}

/* ---------------------------------------------------------------------------
 * Live catalog
 * Firestore can't do substring search, and suggestions must match words anywhere
 * ("15 pro" → "iPhone 15 Pro"). The catalog is small, so we keep a single realtime
 * listener (served from the offline cache first) and filter it in memory.
 * ------------------------------------------------------------------------- */
let catalog = new Map<string, Product>();
let ready: Promise<void> | null = null;
let seedChecked = false;
const CATALOG_WAIT_MS = 3000;

function ensureCatalog(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    // Without a connection (and nothing cached yet) the first snapshot may never arrive:
    // don't block the builder on it — the listener keeps filling the catalog later.
    setTimeout(done, CATALOG_WAIT_MS);
    onSnapshot(
      productsCol,
      { includeMetadataChanges: true },
      (snap) => {
        // Apply only what changed: with thousands of products and three sellers writing,
        // rebuilding the whole map on every snapshot would keep the device busy.
        for (const change of snap.docChanges()) {
          if (change.type === 'removed') catalog.delete(change.doc.id);
          else if (!pending.has(change.doc.id)) catalog.set(change.doc.id, fromDoc(change.doc));
        }
        // The first snapshot may come from the (possibly empty) cache; that's fine for suggestions.
        done();
        if (!snap.metadata.fromCache && !seedChecked) {
          seedChecked = true;
          if (snap.empty) void seedProducts();
        }
      },
      (err) => {
        console.error('No se pudo leer la colección products', err);
        done();
      },
    );
  });
  return ready;
}

async function seedProducts() {
  const batch = writeBatch(db);
  const now = Timestamp.now();
  for (const p of SEED) {
    batch.set(doc(productsCol, productId(p)), {
      ...p,
      updatedAt: now,
      createdByUser: 'chino' satisfies UserId,
      searchKey: buildSearchKey(p),
    });
  }
  await batch.commit();
}

async function allProducts(): Promise<Product[]> {
  await ensureCatalog();
  return [...catalog.values()];
}

/** Start listening early so the first suggestion is instant. */
export function preloadProducts(): void {
  void ensureCatalog();
}

function sameText(a: string, b: string) {
  return normalize(a) === normalize(b);
}

/** Prefix matches rank above substring matches. */
function rank(value: string, query: string) {
  return normalize(value).startsWith(normalize(query)) ? 0 : 1;
}

export interface SuggestionContext {
  type?: string;
  brand?: string;
}

/** Distinct values for the `type` or `brand` fields, most recently used first. */
export async function suggestValues(
  field: 'type' | 'brand',
  query: string,
  context: SuggestionContext = {},
  limit = 6,
): Promise<string[]> {
  const q = normalize(query);
  const seen = new Map<string, { value: string; updatedAt: string }>();
  for (const p of await allProducts()) {
    if (!p[field].trim()) continue;
    if (field === 'brand' && context.type && !sameText(p.type, context.type)) continue;
    if (q && !normalize(p[field]).includes(q)) continue;
    const key = normalize(p[field]);
    const prev = seen.get(key);
    if (!prev || prev.updatedAt < p.updatedAt) seen.set(key, { value: p[field], updatedAt: p.updatedAt });
  }
  // An exact match stays in the list: picking it is harmless, and it keeps its delete (X)
  // reachable when someone types the full name to find it.
  return [...seen.values()]
    .sort((a, b) => rank(a.value, query) - rank(b.value, query) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map((v) => v.value);
}

/** Product suggestions for the model field, narrowed by the type/brand already entered. */
export async function suggestProducts(
  query: string,
  context: SuggestionContext = {},
  limit = 6,
): Promise<Product[]> {
  const q = normalize(query);
  return (await allProducts())
    .filter((p) => {
      if (!p.model.trim()) return false;
      if (context.type && !sameText(p.type, context.type)) return false;
      if (context.brand && !sameText(p.brand, context.brand)) return false;
      return !q || p.searchKey.includes(q);
    })
    .sort((a, b) => rank(a.model, query) - rank(b.model, query) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/** Finds a product by model (preferring one matching type/brand) to recover its last price. */
export async function findProduct(
  model: string,
  context: SuggestionContext = {},
): Promise<Product | undefined> {
  if (!model.trim()) return undefined;
  const candidates = (await allProducts()).filter((p) => sameText(p.model, model));
  return (
    candidates.find(
      (p) =>
        (!context.type || sameText(p.type, context.type)) &&
        (!context.brand || sameText(p.brand, context.brand)),
    ) ?? candidates[0]
  );
}

/** Saved products that would be removed by deleting a type, a brand or a single product. */
export async function productsMatching(field: 'type' | 'brand', value: string): Promise<Product[]> {
  return (await allProducts())
    .filter((p) => sameText(p[field], value))
    .sort((a, b) => a.model.localeCompare(b.model));
}

/**
 * Permanently deletes products from the catalog (they stop being suggested).
 * Quotes keep their own copy of each item, so existing quotes are not affected.
 */
export async function deleteProducts(ids: string[]): Promise<void> {
  // A queued (not yet sent) upsert must not bring a deleted product back.
  for (const id of ids) pending.delete(id);
  const commits: Promise<void>[] = [];
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + 400)) batch.delete(doc(productsCol, id));
    commits.push(batch.commit());
  }
  // A rejection (e.g. rules) arrives quickly and is reported. Without signal the commit
  // never resolves: after a short wait we treat it as queued — it syncs when back online.
  const QUEUED = Symbol('queued');
  const outcome = await Promise.race([
    Promise.all(commits),
    new Promise<typeof QUEUED>((resolve) => setTimeout(() => resolve(QUEUED), 4000)),
  ]);
  if (outcome === QUEUED) {
    Promise.all(commits).catch((err) => console.error('No se pudieron eliminar productos', err));
  }
  // Reflect it right away, even before the listener round-trips.
  for (const id of ids) catalog.delete(id);
}

export interface ProductInput {
  type: string;
  brand: string;
  model: string;
  lastPrice: number;
}

/* ---------------------------------------------------------------------------
 * Writes are queued and flushed in batches: adding 200 items in a row (or three sellers
 * adding at once) produces a handful of batched writes instead of hundreds of single
 * ones, which kept the Firestore client busy and slowed down saving. The local catalog
 * is updated immediately, so suggestions on this device never wait for the flush.
 * ------------------------------------------------------------------------- */
const FLUSH_DELAY_MS = 2000;
const pending = new Map<string, Record<string, unknown>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function enqueue(input: ProductInput, userId: UserId): Product | null {
  const clean = { type: input.type.trim(), brand: input.brand.trim(), model: input.model.trim() };
  if (!clean.model) return null;
  const id = productId(clean);
  const existing = catalog.get(id);
  const now = Timestamp.now();
  const data = {
    ...clean,
    lastPrice: input.lastPrice,
    updatedAt: now,
    searchKey: buildSearchKey(clean),
    // Only the first creator is recorded.
    ...(existing || pending.get(id)?.createdByUser ? {} : { createdByUser: userId }),
  };
  pending.set(id, { ...pending.get(id), ...data });
  const product: Product = {
    id,
    ...clean,
    lastPrice: input.lastPrice,
    updatedAt: now.toDate().toISOString(),
    createdByUser: existing?.createdByUser ?? userId,
    searchKey: data.searchKey,
  };
  catalog.set(id, product);
  return product;
}

function scheduleFlush(delay: number) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushProducts, delay);
}

/** Sends every queued product write now (in batches of up to 400). */
export function flushProducts(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const entries = [...pending.entries()];
  pending.clear();
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db);
    for (const [id, data] of entries.slice(i, i + 400)) batch.set(doc(productsCol, id), data, { merge: true });
    // Not awaited: offline the batch is queued by Firestore and syncs later.
    batch.commit().catch((err) => console.error('No se pudieron guardar los productos', err));
  }
}

// Don't lose queued writes if the tab is closed or sent to the background.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushProducts);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushProducts());
}

/**
 * Upserts many products at once (e.g. every item of a saved quote) and sends them right
 * away in one batch. Duplicates in the input collapse to the last price.
 */
export async function upsertProducts(inputs: ProductInput[], userId: UserId): Promise<void> {
  await ensureCatalog();
  for (const input of inputs) enqueue(input, userId);
  flushProducts();
}

/**
 * Inserts or updates a product (matched on type + brand + model) with its latest price.
 * Visible in this device's suggestions immediately; shared with the other sellers within
 * a couple of seconds (next batched flush).
 */
export async function upsertProduct(input: ProductInput, userId: UserId): Promise<Product> {
  await ensureCatalog();
  const product = enqueue(input, userId);
  scheduleFlush(FLUSH_DELAY_MS);
  if (!product) throw new Error('Producto sin modelo');
  return product;
}
