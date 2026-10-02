import { initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { missingFirebaseEnv } from '../lib/firebaseEnv';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const missing = missingFirebaseEnv();
if (missing.length) {
  // main.tsx checks this first and shows a readable screen; this guards other entry points.
  throw new Error(`Faltan variables de Firebase: ${missing.join(', ')}`);
}

export const app = initializeApp(firebaseConfig);

/**
 * Firestore with IndexedDB persistence shared across tabs, so the app keeps working
 * offline and syncs when the connection comes back.
 * `ignoreUndefinedProperties` lets optional fields (e.g. `notes`) be passed as undefined.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});

// Local testing only: VITE_FIRESTORE_EMULATOR=127.0.0.1:8080 points the app at the
// Firestore emulator instead of production. Never set on the deployed site.
const emulator = import.meta.env.VITE_FIRESTORE_EMULATOR;
if (emulator) {
  const [host, port] = emulator.split(':');
  connectFirestoreEmulator(db, host, Number(port));
}

export const COLLECTIONS = {
  products: 'products',
  quotes: 'quotes',
  appConfig: 'app_config',
  sessions: 'sessions',
} as const;
