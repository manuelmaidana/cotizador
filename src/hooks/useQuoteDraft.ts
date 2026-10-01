import { useCallback, useEffect, useState } from 'react';
import type { Quote, QuoteDraft, QuoteItem, UserId } from '../types';
import { readJson, writeJson } from '../services/storage';
import { quoteExists } from '../services/quoteService';

const emptyDraft = (): QuoteDraft => ({ items: [], notes: '', dirty: false });

/**
 * In-progress quote for one user, persisted locally so a reload never loses work.
 * v2: drafts from the pre-Firestore version pointed at quotes that only existed locally.
 */
export function useQuoteDraft(userId: UserId) {
  const key = `draft:v2:${userId}`;
  const [draft, setDraft] = useState<QuoteDraft>(() => readJson(key, emptyDraft()));

  useEffect(() => writeJson(key, draft), [key, draft]);

  // If the linked quote no longer exists (deleted from another device), the draft
  // becomes a new unsaved quote again instead of claiming to be saved.
  const savedId = draft.savedId;
  useEffect(() => {
    if (!savedId) return;
    let cancelled = false;
    quoteExists(savedId, userId).then((exists) => {
      if (cancelled || exists !== false) return;
      setDraft((d) =>
        d.savedId === savedId
          ? { ...d, savedId: undefined, quoteNumber: undefined, createdAt: undefined, status: undefined, dirty: true }
          : d,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [savedId, userId]);

  const addItem = useCallback(
    (item: QuoteItem) => setDraft((d) => ({ ...d, items: [...d.items, item], dirty: true })),
    [],
  );
  const removeItem = useCallback(
    (id: string) => setDraft((d) => ({ ...d, items: d.items.filter((i) => i.id !== id), dirty: true })),
    [],
  );
  const setNotes = useCallback((notes: string) => setDraft((d) => ({ ...d, notes, dirty: true })), []);
  const reset = useCallback(() => setDraft(emptyDraft()), []);

  /** Syncs the draft with what was persisted. */
  const markSaved = useCallback(
    (quote: Quote) =>
      setDraft((d) => ({
        ...d,
        savedId: quote.id,
        quoteNumber: quote.quoteNumber,
        createdAt: quote.createdAt,
        status: quote.status,
        dirty: false,
      })),
    [],
  );

  /** Opens an existing quote for editing, or copies it into a new one. */
  const loadQuote = useCallback((quote: Quote, asCopy: boolean) => {
    const items = quote.items.map((i) => ({ ...i }));
    setDraft(
      asCopy
        ? { items, notes: quote.notes ?? '', dirty: true }
        : {
            savedId: quote.id,
            quoteNumber: quote.quoteNumber,
            createdAt: quote.createdAt,
            status: quote.status,
            items,
            notes: quote.notes ?? '',
            dirty: false,
          },
    );
  }, []);

  return { draft, addItem, removeItem, setNotes, reset, markSaved, loadQuote };
}

export type QuoteDraftApi = ReturnType<typeof useQuoteDraft>;
