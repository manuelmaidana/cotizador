import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase/firestore';
import {
  MAX_QUOTE_ITEMS,
  type AppUser,
  type CompanyInfo,
  type Quote,
  type QuoteDraft,
  type QuoteItem,
  type QuoteStatus,
  type UserId,
} from '../types';
import { sumItems } from '../lib/utils';
import { UserFacingError, withRetry, withTimeout } from '../lib/errors';
import { reserveQuoteSequence } from './companyService';
import { COLLECTIONS, db } from './firebase';
import { upsertProducts } from './productService';

const quotesCol = collection(db, COLLECTIONS.quotes);

/** One attempt; a timed-out attempt is retried (safe: the draft's reserved ID is idempotent). */
const TRANSACTION_TIMEOUT_MS = 12_000;
/** Total time a seller may wait for a new quote number before seeing an error. */
const SAVE_DEADLINE_MS = 40_000;

export function formatQuoteNumber(sequence: number, date = new Date()): string {
  return `COT-${date.getFullYear()}-${String(sequence).padStart(4, '0')}`;
}

/* ---- Firestore <-> app conversion ---------------------------------------- */

/** Firestore shape: same as `Quote` minus `id`, with `createdAt` as a Timestamp. */
type QuoteDoc = Omit<Quote, 'id' | 'createdAt'> & { createdAt: Timestamp };

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString(); // pending server value
}

function fromDoc(snap: DocumentSnapshot<DocumentData>): Quote {
  const d = snap.data() as QuoteDoc;
  return {
    id: snap.id,
    quoteNumber: d.quoteNumber,
    userId: d.userId,
    userName: d.userName,
    createdAt: toIso(d.createdAt),
    status: d.status,
    items: d.items ?? [],
    totalAmount: d.totalAmount ?? sumItems(d.items ?? []),
    notes: d.notes || undefined,
    companyInfo: d.companyInfo,
  };
}

/* ---- Queries -------------------------------------------------------------- */

const byNewest = (a: Quote, b: Quote) => b.createdAt.localeCompare(a.createdAt);

/** Page size for the history: it grows by this much with each "Ver más". */
export const HISTORY_PAGE_SIZE = 50;

export interface QuotePage {
  quotes: Quote[];
  /** There may be older quotes beyond `limit`. */
  hasMore: boolean;
}

/**
 * Live history of one seller (`where("userId", "==", userId)`), newest first, limited to
 * the `max` most recent quotes so it stays fast with thousands of quotes.
 *
 * Uses the composite index userId + createdAt (firestore.indexes.json). Until that index
 * exists, Firestore rejects the query with `failed-precondition`; we then fall back to the
 * unindexed query (all of the seller's quotes, sorted here) so the history never breaks.
 */
export function subscribeQuotesByUser(
  userId: UserId,
  max: number,
  onChange: (page: QuotePage) => void,
  onError?: (err: Error) => void,
): () => void {
  let unsubscribe = () => {};
  let stopped = false;

  const fallback = () => {
    if (stopped) return;
    console.warn('Falta el índice userId+createdAt en Firestore: se usa la consulta sin índice.');
    unsubscribe = onSnapshot(
      query(quotesCol, where('userId', '==', userId)),
      (snap) => {
        const all = snap.docs.map(fromDoc).sort(byNewest);
        onChange({ quotes: all.slice(0, max), hasMore: all.length > max });
      },
      (err) => {
        console.error('No se pudo leer el historial', err);
        onError?.(err);
      },
    );
  };

  unsubscribe = onSnapshot(
    // One extra document tells whether there's another page.
    query(quotesCol, where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(max + 1)),
    (snap) => {
      const quotes = snap.docs.map(fromDoc).sort(byNewest);
      onChange({ quotes: quotes.slice(0, max), hasMore: quotes.length > max });
    },
    (err) => {
      if ((err as { code?: string }).code === 'failed-precondition') return fallback();
      console.error('No se pudo leer el historial', err);
      onError?.(err);
    },
  );

  return () => {
    stopped = true;
    unsubscribe();
  };
}

/**
 * Finds a quote of this seller by its exact number (e.g. "COT-2026-0042"), wherever it is in
 * the history — even beyond the loaded pages. Two equality filters: no index needed.
 */
export async function findQuoteByNumber(userId: UserId, quoteNumber: string): Promise<Quote | null> {
  const snap = await getDocs(
    query(quotesCol, where('userId', '==', userId), where('quoteNumber', '==', quoteNumber), limit(1)),
  );
  return snap.empty ? null : fromDoc(snap.docs[0]);
}

/** `false` only when the server confirms the quote is gone; `null` when it can't tell (offline). */
export async function quoteExists(id: string, userId: UserId): Promise<boolean | null> {
  try {
    const snap = await getDoc(doc(quotesCol, id));
    if (snap.metadata.fromCache && !snap.exists()) return null;
    return snap.exists() && snap.data().userId === userId;
  } catch {
    return null;
  }
}

async function getOwnedQuote(id: string, userId: UserId) {
  const ref = doc(quotesCol, id);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().userId !== userId) return null;
  return { ref, snap };
}

/* ---- Mutations ------------------------------------------------------------ */

interface SaveQuoteInput {
  draft: QuoteDraft;
  user: AppUser;
  companyInfo: CompanyInfo;
  status: QuoteStatus;
}

/** Keeps `lastPrice` / `updatedAt` of every priced product in the quote up to date (one batch). */
function syncProducts(items: QuoteItem[], userId: UserId) {
  const priced = items
    .filter((item) => item.model && item.unitPrice > 0)
    .map((item) => ({ type: item.type, brand: item.brand, model: item.model, lastPrice: item.unitPrice }));
  if (priced.length) void upsertProducts(priced, userId);
}

/** Firestore's hard limit is 1 MiB per document; keep a margin for field overhead. */
const MAX_QUOTE_BYTES = 900_000;

function assertFits(data: object) {
  if (draftItemsOverLimit(data)) {
    throw new UserFacingError(`Una cotización puede tener hasta ${MAX_QUOTE_ITEMS} ítems.`);
  }
  const bytes = new Blob([JSON.stringify(data)]).size;
  if (bytes > MAX_QUOTE_BYTES) {
    throw new UserFacingError(
      'La cotización es demasiado grande para guardarse. Dividila en dos o usá un logo más liviano en Configuración de Empresa.',
    );
  }
}

function draftItemsOverLimit(data: object) {
  const items = (data as { items?: unknown[] }).items;
  return Array.isArray(items) && items.length > MAX_QUOTE_ITEMS;
}

/**
 * Plain document writes resolve only when the server confirms them. Without signal that
 * never happens, but the write is already safe in the offline cache and syncs later — so
 * after a short wait we report success instead of leaving the seller waiting.
 */
async function settleWrite(write: Promise<void>, ms = 6000): Promise<void> {
  await Promise.race([write, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

/** Creates a new quote, or updates the existing one if the draft was already saved. */
export async function saveQuote({ draft, user, companyInfo, status }: SaveQuoteInput): Promise<Quote> {
  const base = {
    items: draft.items,
    totalAmount: sumItems(draft.items),
    notes: draft.notes.trim() || undefined,
    companyInfo,
  };
  assertFits(base);

  if (draft.savedId) {
    const owned = await getOwnedQuote(draft.savedId, user.id);
    if (owned) {
      const existing = fromDoc(owned.snap);
      // An exported quote never goes back to "saved".
      const nextStatus: QuoteStatus = existing.status === 'exported' ? 'exported' : status;
      await settleWrite(updateDoc(owned.ref, { ...base, status: nextStatus }));
      syncProducts(draft.items, user.id);
      return { ...existing, ...base, status: nextStatus };
    }
    // The quote was deleted elsewhere: fall through and create a new one.
  }

  // Reserving the number and creating the quote happen in one transaction,
  // so two sellers saving at the same time never get the same number.
  // Transactions need the server: fail fast instead of spinning forever without signal.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new UserFacingError('Sin conexión: para numerar una cotización nueva hace falta internet.');
  }

  // The draft's reserved ID makes this idempotent: if a previous attempt timed out but did
  // commit, the retry finds that quote instead of creating a duplicate with a new number.
  //
  // Simultaneous saves: two sellers can read the same sequence. The security rules evaluate
  // before Firestore's own conflict check, so the late transaction gets `permission-denied`
  // (its number is already taken) rather than the retryable `aborted`. A fresh attempt
  // re-reads the counter and takes the next number, so that case is retried too.
  const ref = draft.pendingId ? doc(quotesCol, draft.pendingId) : doc(quotesCol);
  const createdAt = Timestamp.now();
  const { data, created } = await withRetry(
    () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const previous = await tx.get(ref);
        if (previous.exists()) {
          if (previous.data().userId !== user.id) throw new Error('ID de cotización en uso');
          return { data: previous.data() as QuoteDoc, created: false };
        }
        const { sequence } = await reserveQuoteSequence(tx);
        const fresh: QuoteDoc = {
          quoteNumber: formatQuoteNumber(sequence, createdAt.toDate()),
          userId: user.id,
          userName: user.name,
          createdAt,
          status,
          ...base,
        };
        tx.set(ref, fresh);
        return { data: fresh, created: true };
      }),
      TRANSACTION_TIMEOUT_MS,
    ),
    { attempts: 6, alsoRetry: ['permission-denied', 'failed-precondition'], deadlineMs: SAVE_DEADLINE_MS },
  );

  if (!created) {
    // Found from an earlier attempt: bring it up to date with the current draft.
    await settleWrite(updateDoc(ref, { ...base }));
  }
  syncProducts(draft.items, user.id);
  return {
    id: ref.id,
    quoteNumber: data.quoteNumber,
    userId: data.userId,
    userName: data.userName,
    createdAt: toIso(data.createdAt),
    status: data.status,
    ...base,
  };
}

export async function markQuoteExported(id: string, userId: UserId): Promise<Quote | undefined> {
  const owned = await getOwnedQuote(id, userId);
  if (!owned) return undefined;
  await settleWrite(updateDoc(owned.ref, { status: 'exported' }));
  return { ...fromDoc(owned.snap), status: 'exported' };
}

export async function deleteQuote(id: string, userId: UserId): Promise<void> {
  const owned = await getOwnedQuote(id, userId);
  if (owned) await deleteDoc(owned.ref);
}
