#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-backups}"
CONTAINER="${CONTAINER:-gis-tataruang-db}"
DATABASE="${DATABASE:-gis_tataruang}"
USER="${USER:-gis}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="gis_${STAMP}.dump"

mkdir -p "$OUT_DIR"
echo "Membuat cadangan basis data $DATABASE..."
docker exec "$CONTAINER" pg_dump -U "$USER" -d "$DATABASE" -Fc -f "/tmp/$FILE"
docker cp "${CONTAINER}:/tmp/$FILE" "${OUT_DIR}/${FILE}"
docker exec "$CONTAINER" rm "/tmp/$FILE"
echo "Cadangan tersimpan: ${OUT_DIR}/${FILE}"
echo "Pulihkan dengan: docker exec -i $CONTAINER pg_restore -U $USER -d $DATABASE --clean --if-exists < ${OUT_DIR}/${FILE}"
