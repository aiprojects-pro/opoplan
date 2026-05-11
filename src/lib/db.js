const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────────────────────
// Capa de persistencia con dos backends transparentes:
//
//   1. JSON (default, dev): todo en data/app-data.json. Cache en memoria,
//      reescritura atómica del archivo completo en cada cambio. Simple,
//      ideal para desarrollo y demos. NO escala más allá de ~50 usuarios
//      activos por la latencia de reescribir el archivo entero.
//
//   2. SQLite (recomendado producción): activado con OPOPLAN_DB=sqlite.
//      Requiere `better-sqlite3` (dependencia OPCIONAL — instalar antes
//      de activarla). Una tabla por colección con schema:
//      (id TEXT PRIMARY KEY, data JSON). Lectura idéntica al JSON
//      (cargamos en memoria al arrancar para preservar la semántica de
//      predicados arbitrarios). Escritura por colección atómica con
//      SQLite, no monolítica como el JSON.
//
// La API pública es idéntica en ambos backends: el resto del código no
// cambia. La elección se hace por env: OPOPLAN_DB=sqlite|json.
//
// Migración: el comando `node scripts/migrate-to-sqlite.js` lee el JSON
// existente y lo vuelca en SQLite, listo para arrancar con OPOPLAN_DB=sqlite.
// ─────────────────────────────────────────────────────────────────────────────

const dataDir = path.join(__dirname, "..", "..", "data");
const dataFile = path.join(dataDir, "app-data.json");
const sqliteFile = path.join(dataDir, "app-data.sqlite");

const PROVIDER = (process.env.OPOPLAN_DB || "json").toLowerCase();

let cache = null;
let writeQueue = Promise.resolve();
let sqliteDb = null;
let sqliteAvailable = false;

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

// ── Setup de SQLite (lazy, solo si OPOPLAN_DB=sqlite) ────────────────────
function tryLoadSqlite() {
  if (sqliteDb !== null) return sqliteAvailable;
  try {
    const Database = require("better-sqlite3");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    sqliteDb = new Database(sqliteFile);
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("synchronous = NORMAL");
    sqliteAvailable = true;
    return true;
  } catch (e) {
    console.error("[db] OPOPLAN_DB=sqlite pero better-sqlite3 no está disponible:", e.message);
    console.error("    Instala con: npm install better-sqlite3");
    console.error("    Mientras tanto, fallback a JSON");
    sqliteDb = false;
    sqliteAvailable = false;
    return false;
  }
}

function ensureCollectionTable(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error(`invalid_collection_name: ${name}`);
  sqliteDb.exec(`CREATE TABLE IF NOT EXISTS coll_${name} (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  )`);
}

function loadFromSqlite() {
  const data = {};
  const tables = sqliteDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'coll_%'")
    .all();
  for (const { name } of tables) {
    const collName = name.replace(/^coll_/, "");
    const rows = sqliteDb.prepare(`SELECT data FROM ${name}`).all();
    data[collName] = rows.map((r) => JSON.parse(r.data));
  }
  sqliteDb.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  const settingsRows = sqliteDb.prepare("SELECT key, value FROM settings").all();
  data.settings = {};
  for (const { key, value } of settingsRows) {
    try { data.settings[key] = JSON.parse(value); } catch { data.settings[key] = value; }
  }
  return data;
}

function seedSqlite(seedData) {
  const tx = sqliteDb.transaction((data) => {
    for (const [collName, items] of Object.entries(data)) {
      if (collName === "settings") {
        sqliteDb.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
        const stmt = sqliteDb.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
        for (const [k, v] of Object.entries(items || {})) {
          stmt.run(k, JSON.stringify(v));
        }
        continue;
      }
      if (!Array.isArray(items)) continue;
      ensureCollectionTable(collName);
      const stmt = sqliteDb.prepare(`INSERT INTO coll_${collName} (id, data) VALUES (?, ?)`);
      for (const item of items) {
        const itemId = item.id || id(collName.slice(0, 3));
        stmt.run(itemId, JSON.stringify(item));
      }
    }
  });
  tx(seedData);
}

// ── API pública ──────────────────────────────────────────────────────────

function load() {
  if (cache) return cache;
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (PROVIDER === "sqlite" && tryLoadSqlite()) {
    const tableCount = sqliteDb
      .prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name LIKE 'coll_%'")
      .get();
    if (tableCount.n === 0) {
      const seed = require("./seed");
      const seedData = seed();
      seedSqlite(seedData);
      console.log("[db]            sqlite sembrado desde seed.js");
    }
    cache = loadFromSqlite();
    return cache;
  }

  if (!fs.existsSync(dataFile)) {
    const seed = require("./seed");
    fs.writeFileSync(dataFile, JSON.stringify(seed(), null, 2));
  }
  cache = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  return cache;
}

function persist(touchedCollections) {
  if (sqliteAvailable) {
    return persistSqlite(touchedCollections);
  }
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve, reject) => {
        const tmp = dataFile + ".tmp";
        fs.writeFile(tmp, JSON.stringify(cache, null, 2), (err) => {
          if (err) return reject(err);
          fs.rename(tmp, dataFile, (err2) => (err2 ? reject(err2) : resolve()));
        });
      }),
  );
  return writeQueue;
}

function persistSqlite(touchedCollections) {
  if (!sqliteDb || !cache) return Promise.resolve();
  const colls = touchedCollections && touchedCollections.length
    ? touchedCollections
    : Object.keys(cache).filter((k) => Array.isArray(cache[k]));
  try {
    const tx = sqliteDb.transaction(() => {
      for (const name of colls) {
        if (name === "settings") continue; // se maneja aparte
        if (!Array.isArray(cache[name])) continue;
        ensureCollectionTable(name);
        sqliteDb.exec(`DELETE FROM coll_${name}`);
        const stmt = sqliteDb.prepare(`INSERT INTO coll_${name} (id, data) VALUES (?, ?)`);
        for (const item of cache[name]) {
          const itemId = item.id || id(name.slice(0, 3));
          stmt.run(itemId, JSON.stringify(item));
        }
      }
      if ((touchedCollections || []).includes("settings") || !touchedCollections) {
        if (cache.settings) {
          sqliteDb.exec(`DELETE FROM settings`);
          const stmt = sqliteDb.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
          for (const [k, v] of Object.entries(cache.settings)) {
            stmt.run(k, JSON.stringify(v));
          }
        }
      }
    });
    tx();
  } catch (e) {
    console.error("[db:sqlite] persist error:", e.message);
  }
  return Promise.resolve();
}

function collection(name) {
  const data = load();
  if (!Array.isArray(data[name])) data[name] = [];
  return data[name];
}

function find(name, predicate) {
  return collection(name).filter(predicate);
}

function findOne(name, predicate) {
  return collection(name).find(predicate) || null;
}

function insert(name, item) {
  collection(name).push(item);
  persist([name]);
  return item;
}

function update(name, predicate, patch) {
  const list = collection(name);
  let updated = null;
  for (let i = 0; i < list.length; i++) {
    if (predicate(list[i])) {
      list[i] = { ...list[i], ...patch };
      updated = list[i];
      break;
    }
  }
  if (updated) persist([name]);
  return updated;
}

function remove(name, predicate) {
  const list = collection(name);
  const before = list.length;
  const kept = list.filter((x) => !predicate(x));
  if (kept.length !== before) {
    cache[name] = kept;
    persist([name]);
    return before - kept.length;
  }
  return 0;
}

function settings() {
  const data = load();
  if (!data.settings) data.settings = {};
  return data.settings;
}

function setSettings(patch) {
  const data = load();
  data.settings = { ...(data.settings || {}), ...patch };
  persist(["settings"]);
  return data.settings;
}

function close() {
  if (sqliteDb && sqliteDb !== false) {
    try { sqliteDb.close(); } catch (_e) { /* ya cerrada */ }
  }
  sqliteDb = null;
  sqliteAvailable = false;
  cache = null;
}

module.exports = {
  id, load, persist, collection,
  find, findOne, insert, update, remove,
  settings, setSettings,
  close,
  _provider: () => (sqliteAvailable ? "sqlite" : "json"),
};
