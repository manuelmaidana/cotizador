export type UserId = 'chino' | 'damian' | 'rulo';
export type UserName = 'Chino' | 'Damian' | 'Rulo';

export interface AppUser {
  id: UserId;
  name: UserName;
  initials: string;
  /** Tailwind classes for the avatar chip */
  tone: string;
}

/**
 * Dates are ISO strings inside the app.
 * The service layer converts them to/from Firestore `Timestamp`.
 */
export type IsoDate = string;

export interface Product {
  id: string;
  type: string;
  brand: string;
  model: string;
  lastPrice: number;
  updatedAt: IsoDate;
  createdByUser: UserId;
  searchKey: string;
}

export interface QuoteItem {
  id: string;
  type: string;
  brand: string;
  model: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface CompanyInfo {
  brandName: string;
  logoUrl: string;
  phone: string;
  whatsapp: string;
  address: string;
  email: string;
  instagram: string;
  website: string;
}

export interface CompanyConfig extends CompanyInfo {
  quoteSequence: number;
}

export type QuoteStatus = 'saved' | 'exported';

export interface Quote {
  id: string;
  quoteNumber: string;
  userId: UserId;
  userName: UserName;
  createdAt: IsoDate;
  status: QuoteStatus;
  items: QuoteItem[];
  totalAmount: number;
  notes?: string;
  companyInfo: CompanyInfo;
}

/** Fields that can be toggled on/off in the quote builder. */
export type ItemField = 'type' | 'brand' | 'model' | 'price';
export type FieldToggles = Record<ItemField, boolean>;

/** Limit per quote (also enforced by firestore.rules) — keeps documents well under 1 MB. */
export const MAX_QUOTE_ITEMS = 200;

/** In-progress quote. `savedId` is set once it has been persisted. */
export interface QuoteDraft {
  savedId?: string;
  /**
   * Firestore ID reserved for this draft before its first save, so retrying a save
   * after a timeout finds the quote already created instead of creating a duplicate.
   */
  pendingId?: string;
  quoteNumber?: string;
  createdAt?: IsoDate;
  /** Status of the persisted quote, once saved. */
  status?: QuoteStatus;
  items: QuoteItem[];
  notes: string;
  /** True when there are changes not yet persisted. */
  dirty: boolean;
}

/** Top-level screens of the app (no router needed for three views). */
export type View = 'quote' | 'history' | 'config';
