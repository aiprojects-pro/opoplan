#!/usr/bin/env node
// Migra data/app-data.json a data/app-data.sqlite.
//
// Uso:
//   1. Instalar SQLite: `npm install better-sqlite3` (si no estaba)
//   2. Ejecutar: `npm run migrate-sqlite` (o `node scripts/migrate-to-sqlite.js`)
//   3. Arrancar con: `OPOPLAN_DB=sqlite npm start`
//
// El script es seguro: si data/app-data.sqlite ya existe y NO está vacía,
// rechaza migrar para evitar sobrescribir datos. Borra el archivo manualmente
// si quieres rehacer la migración.

const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const jsonFile = path.join(dataDir, "app-data.json");
const sqliteFile = path.join(dataDir, "app-data.sqlite");

let Database;
try {
  Database = require("better-sqlite3");
} catch (e) {
  console.error("✗ better-sqlite3 no está instalado.");
  console.error("  Ejecuta: npm install better-sqlite3");
  process.exit(1);
}

if (!fs.existsSync(jsonFile)) {
  console.error(`✗ No existe ${jsonFile} — no hay nada que migrar.`);
  console.error("  Arranca el servidor una vez en modo JSON para generar el seed.");
  process.exit(1);
}

if (fs.existsSync(sqliteFile) && fs.statSync(sqliteFile).size > 0) {
  console.error(`✗ ${sqliteFile} ya existe y no está vacío.`);
  console.error("  Elimínalo manualmente si quieres rehacer la migración: rm data/app-data.sqlite*");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
console.log(`✓ Leído ${jsonFile} con ${Object.keys(data).length} colecciones.`);

const db = new Database(sqliteFile);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

function ensureTable(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error(`invalid_collection_name: ${name}`);
  db.exec(`CREATE TABLE IF NOT EXISTS coll_${name} (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  )`);
}

const counts = {};
const tx = db.transaction(() => {
  for (const [name, items] of Object.entries(data)) {
    if (name === "settings") {
      db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
      const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
      let n = 0;
      for (const [k, v] of Object.entries(items || {})) {
        stmt.run(k, JSON.stringify(v));
        n++;
      }
      counts[name] = n;
      continue;
    }
    if (!Array.isArray(items)) continue;
    ensureTable(name);
    const stmt = db.prepare(`INSERT INTO coll_${name} (id, data) VALUES (?, ?)`);
    let n = 0;
    for (const item of items) {
      const itemId = item.id || `${name.slice(0, 3)}_${Math.random().toString(36).slice(2, 10)}`;
      stmt.run(itemId, JSON.stringify(item));
      n++;
    }
    counts[name] = n;
  }
});
tx();

// Verificación: contar filas insertadas y comparar con el JSON
console.log("\nResumen de la migración:");
console.log("─".repeat(54));
let totalIn = 0, totalOut = 0;
for (const [name, items] of Object.entries(data)) {
  if (name === "settings") {
    const expected = Object.keys(items || {}).length;
    const actual = db.prepare("SELECT COUNT(*) as n FROM settings").get().n;
    totalIn += expected; totalOut += actual;
    const mark = expected === actual ? "✓" : "✗";
    console.log(`  ${mark} ${name.padEnd(30)} ${actual}/${expected}`);
    continue;
  }
  if (!Array.isArray(items)) continue;
  const expected = items.length;
  const actual = db.prepare(`SELECT COUNT(*) as n FROM coll_${name}`).get().n;
  totalIn += expected; totalOut += actual;
  const mark = expected === actual ? "✓" : "✗";
  console.log(`  ${mark} ${name.padEnd(30)} ${actual}/${expected}`);
}
console.log("─".repeat(54));
console.log(`  TOTAL                          ${totalOut}/${totalIn}`);

db.close();

if (totalIn === totalOut) {
  console.log("\n✓ Migración completa. Arranca con: OPOPLAN_DB=sqlite npm start");
  console.log("  El archivo data/app-data.json sigue intacto como backup.");
} else {
  console.error("\n✗ Migración incompleta. Revisa el resumen anterior.");
  process.exit(1);
}
