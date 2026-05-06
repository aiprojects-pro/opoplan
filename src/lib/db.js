const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────────────────────
// Capa de persistencia. Usa un único JSON con todas las colecciones.
// Pensada para ser sustituida por SQLite/Postgres sin tocar el resto del
// código: todos los accesos van por estos métodos.
// ─────────────────────────────────────────────────────────────────────────────

const dataDir = path.join(__dirname, "..", "..", "data");
const dataFile = path.join(dataDir, "app-data.json");

let cache = null;
let writeQueue = Promise.resolve();

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function load() {
  if (cache) return cache;
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    const seed = require("./seed");
    fs.writeFileSync(dataFile, JSON.stringify(seed(), null, 2));
  }
  cache = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  return cache;
}

function persist() {
  // Serializamos las escrituras para evitar corrupción cuando hay varias
  // peticiones concurrentes que modifican el JSON.
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
  persist();
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
  if (updated) persist();
  return updated;
}

function remove(name, predicate) {
  const list = collection(name);
  const before = list.length;
  const kept = list.filter((x) => !predicate(x));
  if (kept.length !== before) {
    cache[name] = kept;
    persist();
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
  persist();
  return data.settings;
}

module.exports = {
  id,
  load,
  persist,
  collection,
  find,
  findOne,
  insert,
  update,
  remove,
  settings,
  setSettings,
};
