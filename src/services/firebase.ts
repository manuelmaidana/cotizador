import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error('Faltan las variables VITE_FIREBASE_* en .env.local');
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

export const COLLECTIONS = {
  products: 'products',
  quotes: 'quotes',
  appConfig: 'app_config',
  sessions: 'sessions',
} as const;
