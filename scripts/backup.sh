#!/usr/bin/env bash
# Backup diario de la BD JSON + uploads. Diseñado para correr desde el host
# (no desde el contenedor), por cron, contra el directorio del proyecto.
#
# Crea un .tar.gz con timestamp en ./backups/ y mantiene los N más recientes.
#
# Uso (manual):
#   ./scripts/backup.sh
#
# Uso (crontab del host, diario a las 03:00):
#   0 3 * * * cd /ruta/opoplan && ./scripts/backup.sh >> backups/cron.log 2>&1
#
# Configurable por env:
#   BACKUP_DIR=./backups   (destino)
#   BACKUP_KEEP=14         (cuántos backups guardar)

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/opoplan-$timestamp.tar.gz"

# Avisa pero no falla si data/ o uploads/ no existen todavía
includes=()
[ -d data ] && includes+=("data")
[ -d uploads ] && includes+=("uploads")
if [ ${#includes[@]} -eq 0 ]; then
	echo "[backup] nada que respaldar (no hay data/ ni uploads/)" >&2
	exit 0
fi

tar -czf "$out" "${includes[@]}"
size=$(du -h "$out" | cut -f1)
echo "[backup] $out ($size)"

# Limpia backups viejos: mantiene los $BACKUP_KEEP más recientes.
ls -1t "$BACKUP_DIR"/opoplan-*.tar.gz 2>/dev/null \
	| tail -n +$((BACKUP_KEEP + 1)) \
	| while read -r old; do
		rm -f "$old"
		echo "[backup] purgado $old"
	done
