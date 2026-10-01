/** Firebase settings the app can't start without (baked in at build time by Vite). */
export const REQUIRED_FIREBASE_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export function missingFirebaseEnv(): string[] {
  return REQUIRED_FIREBASE_ENV.filter((key) => !import.meta.env[key]?.trim());
}
