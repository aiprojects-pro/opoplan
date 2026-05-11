const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────────────────────
// Gestión de contraseñas.
//
// Formato nuevo: bcrypt (`$2a$10$...` / `$2b$10$...`).
// Formato heredado: SHA-256 con prefijo "opoplan:" (64 hex chars).
//
// Estrategia de migración transparente: en cada login válido contra un hash
// heredado, lo re-hasheamos con bcrypt y persistimos. Tras unos meses de uso
// real, todos los usuarios activos quedan migrados sin pedirles que cambien
// la contraseña.
//
// Para producción seria también convendría:
//   - Subir BCRYPT_ROUNDS a 12 (este valor da ~250ms en hardware típico).
//   - Implementar un job que invalide y obligue a renovar las heredadas
//     pasados N meses (los usuarios que no entraron quedan con SHA-256 si no
//     hacemos esto).
// ─────────────────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;

// Hash heredado (SHA-256 con sal de prefijo). Mantenido SOLO para verificar
// contraseñas creadas antes de la migración. NO se usa para hashear nuevo.
function legacyHash(password) {
  return crypto.createHash("sha256").update(`opoplan:${password}`).digest("hex");
}

function isLegacy(stored) {
  return typeof stored === "string" && /^[a-f0-9]{64}$/.test(stored);
}

function isBcrypt(stored) {
  return typeof stored === "string" && /^\$2[ayb]\$\d{2}\$/.test(stored);
}

// Hashea una contraseña en formato actual (bcrypt). Síncrono porque solo lo
// usamos en operaciones puntuales (registro/cambio), no en bucles calientes.
function hash(password) {
  return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

// Verifica una contraseña contra el hash almacenado.
// Acepta tanto bcrypt (nuevo) como SHA-256 (heredado).
// Devuelve { ok, needsRehash } — si needsRehash=true, el llamante debe
// re-hashear con `hash(password)` y guardar.
function verify(password, stored) {
  if (!stored) return { ok: false, needsRehash: false };
  if (isBcrypt(stored)) {
    try {
      return { ok: bcrypt.compareSync(String(password), stored), needsRehash: false };
    } catch {
      return { ok: false, needsRehash: false };
    }
  }
  if (isLegacy(stored)) {
    const ok = legacyHash(password) === stored;
    return { ok, needsRehash: ok }; // si match, se debe migrar a bcrypt
  }
  return { ok: false, needsRehash: false };
}

// Genera contraseña aleatoria legible y razonablemente segura (12 chars
// alfanuméricos sobre alfabeto de ~62 caracteres → ~71 bits de entropía).
// Para envíos de bienvenida en carga masiva.
function generateTempPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // sin 0/O/1/l/I para no confundir
  const buf = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[buf[i] % alphabet.length];
  }
  return out;
}

module.exports = { hash, verify, isLegacy, isBcrypt, legacyHash, generateTempPassword };
