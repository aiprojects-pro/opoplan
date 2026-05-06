const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────────────────────
// Servicio de almacenamiento. Adapter dual:
//   - "local": guarda los archivos en ./uploads/ y los sirve desde el server.
//   - "r2" / "s3": Cloudflare R2 o cualquier S3 compatible (usa AWS SDK v3).
// La interfaz expuesta es la misma:
//   put({ key, body, contentType }) → { key, url }
//   get(key) → { stream, contentType }
//   delete(key)
//   getSignedUrl(key, ttl)  // para descargas temporales
// El cliente real se construye perezosamente para no fallar si no hay claves.
// ─────────────────────────────────────────────────────────────────────────────

const localDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

function makeLocal(publicBaseUrl) {
  return {
    provider: "local",
    async put({ key, body, contentType }) {
      const safeKey = key.replace(/[^a-zA-Z0-9_./-]/g, "_");
      const full = path.join(localDir, safeKey);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (Buffer.isBuffer(body)) fs.writeFileSync(full, body);
      else if (typeof body === "string") fs.writeFileSync(full, body);
      else await new Promise((res, rej) => body.pipe(fs.createWriteStream(full)).on("finish", res).on("error", rej));
      return { key: safeKey, url: `${publicBaseUrl}/files/${safeKey}` };
    },
    async get(key) {
      const full = path.join(localDir, key);
      if (!fs.existsSync(full)) throw new Error("not_found");
      return { stream: fs.createReadStream(full), contentType: "application/octet-stream" };
    },
    async delete(key) {
      const full = path.join(localDir, key);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    },
    async getSignedUrl(key /* , ttl */) {
      // En modo local devolvemos la URL pública estática.
      return `${publicBaseUrl}/files/${key}`;
    },
  };
}

function makeS3({ provider, bucket, endpoint, region, accessKeyId, secretAccessKey, publicUrl }) {
  // Carga perezosa para no exigir el SDK si no se usa
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

  const client = new S3Client({
    region: region || "auto",
    endpoint: endpoint || undefined,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: provider === "r2", // R2 prefiere path-style
  });

  return {
    provider,
    async put({ key, body, contentType }) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
      return { key, url: publicUrl ? `${publicUrl}/${key}` : `s3://${bucket}/${key}` };
    },
    async get(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return { stream: out.Body, contentType: out.ContentType || "application/octet-stream" };
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async getSignedUrl(key, ttlSeconds = 600) {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, cmd, { expiresIn: ttlSeconds });
    },
  };
}

function buildKey(orgId, kind, originalName) {
  const ext = path.extname(originalName || "").slice(0, 10);
  const stamp = crypto.randomBytes(6).toString("hex");
  return `${orgId}/${kind}/${Date.now()}-${stamp}${ext}`;
}

function fromEnv(env, appUrl) {
  const provider = (env.STORAGE_PROVIDER || "local").toLowerCase();
  if (provider === "local") return makeLocal(appUrl || `http://localhost:${env.PORT || 3000}`);
  if (provider === "r2" || provider === "s3") {
    if (!env.STORAGE_BUCKET || !env.STORAGE_ACCESS_KEY_ID || !env.STORAGE_SECRET_ACCESS_KEY) {
      console.warn(`[storage] provider=${provider} pero faltan claves; cayendo a local.`);
      return makeLocal(appUrl);
    }
    return makeS3({
      provider,
      bucket: env.STORAGE_BUCKET,
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION || "auto",
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
      publicUrl: env.STORAGE_PUBLIC_URL,
    });
  }
  return makeLocal(appUrl);
}

module.exports = { fromEnv, makeLocal, makeS3, buildKey };
