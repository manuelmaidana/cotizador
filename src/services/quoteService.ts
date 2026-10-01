import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase/firestore';
import type { AppUser, CompanyInfo, Quote, QuoteDraft, QuoteItem, QuoteStatus, UserId } from '../types';
import { sumItems } from '../lib/utils';
import { reserveQuoteSequence } from './companyService';
import { COLLECTIONS, db } from './firebase';
import { upsertProduct } from './productService';

const quotesCol = collection(db, COLLECTIONS.quotes);

const TRANSACTION_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Firestore no respondió a tiempo')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

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

/**
 * History isolation: `where("userId", "==", userId)`.
 * Sorted client-side so no composite index (userId + createdAt) is required.
 */
export async function listQuotesByUser(userId: UserId): Promise<Quote[]> {
  const snap = await getDocs(query(quotesCol, where('userId', '==', userId)));
  return snap.docs.map(fromDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Live version of `listQuotesByUser`: the history updates as soon as a quote is
 * saved or exported on any device. Returns the unsubscribe function.
 */
export function subscribeQuotesByUser(
  userId: UserId,
  onChange: (quotes: Quote[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    query(quotesCol, where('userId', '==', userId)),
    (snap) => onChange(snap.docs.map(fromDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    (err) => {
      console.error('No se pudo leer el historial', err);
      onError?.(err);
    },
  );
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

/** Keeps `lastPrice` / `updatedAt` of every priced product in the quote up to date. */
function syncProducts(items: QuoteItem[], userId: UserId) {
  for (const item of items) {
    if (!item.model || item.unitPrice <= 0) continue;
    void upsertProduct(
      { type: item.type, brand: item.brand, model: item.model, lastPrice: item.unitPrice },
      userId,
    );
  }
}

/** Creates a new quote, or updates the existing one if the draft was already saved. */
export async function saveQuote({ draft, user, companyInfo, status }: SaveQuoteInput): Promise<Quote> {
  const base = {
    items: draft.items,
    totalAmount: sumItems(draft.items),
    notes: draft.notes.trim() || undefined,
    companyInfo,
  };

  if (draft.savedId) {
    const owned = await getOwnedQuote(draft.savedId, user.id);
    if (owned) {
      const existing = fromDoc(owned.snap);
      // An exported quote never goes back to "saved".
      const nextStatus: QuoteStatus = existing.status === 'exported' ? 'exported' : status;
      await updateDoc(owned.ref, { ...base, status: nextStatus });
      syncProducts(draft.items, user.id);
      return { ...existing, ...base, status: nextStatus };
    }
    // The quote was deleted elsewhere: fall through and create a new one.
  }

  // Reserving the number and creating the quote happen in one transaction,
  // so two sellers saving at the same time never get the same number.
  // Transactions need the server: fail fast instead of spinning forever without signal.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Sin conexión: el número de cotización necesita conexión a internet.');
  }
  const ref = doc(quotesCol);
  const createdAt = Timestamp.now();
  const created = await withTimeout(runTransaction(db, async (tx) => {
    const { sequence } = await reserveQuoteSequence(tx);
    const data: QuoteDoc = {
      quoteNumber: formatQuoteNumber(sequence, createdAt.toDate()),
      userId: user.id,
      userName: user.name,
      createdAt,
      status,
      ...base,
    };
    tx.set(ref, data);
    return data;
  }), TRANSACTION_TIMEOUT_MS);

  syncProducts(draft.items, user.id);
  return { id: ref.id, ...created, createdAt: createdAt.toDate().toISOString() };
}

export async function markQuoteExported(id: string, userId: UserId): Promise<Quote | undefined> {
  const owned = await getOwnedQuote(id, userId);
  if (!owned) return undefined;
  await updateDoc(owned.ref, { status: 'exported' });
  return { ...fromDoc(owned.snap), status: 'exported' };
}

export async function deleteQuote(id: string, userId: UserId): Promise<void> {
  const owned = await getOwnedQuote(id, userId);
  if (owned) await deleteDoc(owned.ref);
}
