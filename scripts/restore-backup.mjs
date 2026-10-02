#!/usr/bin/env node
/**
 * Restores a backup made with "Descargar respaldo" (Configuración de Empresa) into Firestore.
 *
 *   npm run restore -- --file respaldo-cotizador-2026-10-01-1830.json --key clave-admin.json
 *   npm run restore -- --file respaldo-....json --key clave-admin.json --apply
 *
 * --file    The backup file (.json) downloaded from the app.
 * --key     Firebase admin key (Firebase Console > Project settings > Service accounts >
 *           "Generate new private key"). Keep it private: it bypasses the security rules.
 * --apply   Actually write. Without it the script only shows what it would do (dry run).
 * --emulator host:port   Restore into a local Firestore emulator instead (for testing).
 *
 * What it does:
 * - Writes every quote and product from the file back with its original ID and number.
 * - Restores the company details.
 * - Never deletes anything already in the database.
 * - Skips a quote whose number now belongs to a *different* quote (no duplicate numbers).
 * - Moves the quote counter forward past the highest restored number, never backwards.
 */
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const apply = args.includes('--apply');
const file = arg('file');
const key = arg('key');
const emulator = arg('emulator');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!file) fail('Falta --file <respaldo.json>');
if (!emulator && !key) fail('Falta --key <clave-admin.json> (o --emulator host:port para pruebas)');

// ---- Read and validate the backup ------------------------------------------------
let backup;
try {
  backup = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
} catch (err) {
  fail(`No se pudo leer el respaldo: ${err.message}`);
}
if (backup?.format !== 'cotizador-backup') fail('El archivo no es un respaldo del Cotizador.');
if (backup.version !== 1) fail(`Versión de respaldo no soportada: ${backup.version}`);
if (!Array.isArray(backup.quotes) || !Array.isArray(backup.products)) fail('Respaldo incompleto o dañado.');

/** `{ "__timestamp": iso }` → Firestore Timestamp, recursively. */
function decode(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.__timestamp === 'string') {
    return Timestamp.fromDate(new Date(value.__timestamp));
  }
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  return value;
}
const withoutId = ({ id: _id, ...rest }) => rest;
const sequenceOf = (quoteNumber) => Number(String(quoteNumber ?? '').split('-')[2]) || 0;

// ---- Connect -------------------------------------------------------------------------
let projectId;
if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST = emulator;
  projectId = arg('project') ?? 'demo-cotizador';
  // Tells the admin SDK the project up front, so it doesn't probe for Google Cloud metadata.
  process.env.GCLOUD_PROJECT = projectId;
  initializeApp({ projectId });
} else {
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(fs.readFileSync(path.resolve(key), 'utf8'));
  } catch (err) {
    fail(`No se pudo leer la clave de administrador: ${err.message}`);
  }
  projectId = serviceAccount.project_id;
  initializeApp({ credential: cert(serviceAccount), projectId });
}
const db = getFirestore();

// ---- Plan ------------------------------------------------------------------------------
console.log(`\nRespaldo: ${path.basename(file)}`);
console.log(`  creado ${backup.createdAt} por ${backup.createdBy}: ${backup.quotes.length} cotizaciones, ${backup.products.length} productos`);
console.log(`Destino: ${emulator ? `emulador ${emulator}` : `proyecto ${projectId}`}\n`);

const [quotesSnap, productsSnap, companySnap] = await Promise.all([
  db.collection('quotes').get(),
  db.collection('products').get(),
  db.collection('app_config').doc('company').get(),
]);
const currentQuotes = new Map(quotesSnap.docs.map((d) => [d.id, d.data()]));
const currentByNumber = new Map(quotesSnap.docs.map((d) => [d.data().quoteNumber, d.id]));
const currentProducts = new Set(productsSnap.docs.map((d) => d.id));
const currentSeq = companySnap.exists ? companySnap.data().quoteSequence ?? 0 : 0;

const quotesToWrite = [];
const conflicts = [];
for (const q of backup.quotes) {
  const owner = currentByNumber.get(q.quoteNumber);
  if (owner && owner !== q.id) conflicts.push(`${q.quoteNumber} (en la base pertenece a otra cotización)`);
  else quotesToWrite.push(q);
}
const newQuotes = quotesToWrite.filter((q) => !currentQuotes.has(q.id)).length;
const newProducts = backup.products.filter((p) => !currentProducts.has(p.id)).length;
const highest = Math.max(
  currentSeq,
  backup.company?.quoteSequence ?? 0,
  ...quotesToWrite.map((q) => sequenceOf(q.quoteNumber)),
  ...[...currentByNumber.keys()].map(sequenceOf),
);

console.log('Plan:');
console.log(`  cotizaciones: ${quotesToWrite.length} a escribir (${newQuotes} nuevas, ${quotesToWrite.length - newQuotes} se sobrescriben)`);
console.log(`  productos:    ${backup.products.length} a escribir (${newProducts} nuevos, ${backup.products.length - newProducts} se sobrescriben)`);
console.log(`  empresa:      ${backup.company ? 'se restauran los datos' : 'sin datos en el respaldo'}`);
console.log(`  contador:     ${currentSeq} → ${highest} (nunca retrocede)`);
console.log('  no se borra nada de lo que ya está en la base');
if (conflicts.length) {
  console.log(`\n⚠ ${conflicts.length} cotización(es) NO se restauran porque su número ya está en uso:`);
  conflicts.slice(0, 20).forEach((c) => console.log(`    ${c}`));
}

if (!apply) {
  console.log('\nPrueba sin cambios (dry run). Para restaurar de verdad, repetí el comando agregando --apply.\n');
  process.exit(0);
}

// ---- Apply -----------------------------------------------------------------------------
const writes = [
  ...quotesToWrite.map((q) => [db.collection('quotes').doc(q.id), decode(withoutId(q))]),
  ...backup.products.map((p) => [db.collection('products').doc(p.id), decode(withoutId(p))]),
];
for (let i = 0; i < writes.length; i += 400) {
  const batch = db.batch();
  for (const [ref, data] of writes.slice(i, i + 400)) batch.set(ref, data);
  await batch.commit();
  process.stdout.write(`  escrito ${Math.min(i + 400, writes.length)}/${writes.length}\r`);
}
const company = backup.company ? decode(backup.company) : {};
await db.collection('app_config').doc('company').set({ ...company, quoteSequence: highest }, { merge: true });

console.log(`\n✔ Restauración completa: ${quotesToWrite.length} cotizaciones, ${backup.products.length} productos, contador en ${highest}.\n`);
process.exit(0);
