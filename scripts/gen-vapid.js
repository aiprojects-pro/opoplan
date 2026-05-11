#!/usr/bin/env node
// Genera un par de claves VAPID y las imprime listas para .env.
// Uso: `npm run gen-vapid` o `node scripts/gen-vapid.js`

let webpush;
try {
  webpush = require("web-push");
} catch (e) {
  console.error("✗ Falta el paquete 'web-push'. Instala con: npm install");
  process.exit(1);
}

const keys = webpush.generateVAPIDKeys();
console.log("\n✓ Claves VAPID generadas — copia estas dos líneas en tu .env:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("\nAdicionalmente puedes definir el subject (RFC 8292):");
console.log("VAPID_SUBJECT=mailto:soporte@tu-dominio.com\n");
console.log("⚠️  Importante: la PRIVATE KEY no debe entrar nunca en git ni compartirse.");
console.log("    Si rotas las VAPID keys, todas las suscripciones existentes se invalidan.\n");
